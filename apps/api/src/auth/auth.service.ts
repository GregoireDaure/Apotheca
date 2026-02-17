import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Passkey } from './entities/passkey.entity';

// SimpleWebAuthn v13+ is ESM-only; we use dynamic imports
// in a CommonJS NestJS project.
async function getSimpleWebAuthn() {
  return await import('@simplewebauthn/server');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Relying Party config — derived from environment */
  private readonly rpName: string;
  private readonly rpId: string;
  private readonly origin: string;

  /** In-memory challenge store (keyed by a session token) */
  private readonly challenges = new Map<string, { challenge: string; expiresAt: number }>();

  constructor(
    @InjectRepository(Passkey)
    private readonly passkeyRepository: Repository<Passkey>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.rpName = this.configService.get<string>('WEBAUTHN_RP_NAME', 'Apotheca');
    this.rpId = this.configService.get<string>('WEBAUTHN_RP_ID', 'localhost');
    this.origin = this.configService.get<string>('WEBAUTHN_ORIGIN', 'http://localhost:5173');
  }

  // ---------- Registration ----------

  /**
   * Generate registration options for a new passkey.
   * Returns options to be passed to the browser's `startRegistration()`.
   */
  async generateRegistrationOptions(label?: string): Promise<{
    options: unknown;
    challengeToken: string;
  }> {
    const { generateRegistrationOptions } = await getSimpleWebAuthn();

    // Get all existing credentials to exclude them
    const existing = await this.passkeyRepository.find();
    const excludeCredentials = existing.map((cred) => ({
      id: cred.credentialId,
      transports: (cred.transports ?? []) as AuthenticatorTransport[],
    }));

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: 'household',
      userDisplayName: label ?? 'Household Member',
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', // biometric only
      },
    });

    // Store challenge with 5-minute TTL
    const challengeToken = this.generateChallengeToken();
    this.challenges.set(challengeToken, {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return { options, challengeToken };
  }

  /**
   * Verify and store a new passkey credential.
   */
  async verifyRegistration(
    challengeToken: string,
    body: unknown,
    label?: string,
  ): Promise<{ verified: boolean; jwt?: string }> {
    const { verifyRegistrationResponse } = await getSimpleWebAuthn();

    const stored = this.challenges.get(challengeToken);
    if (!stored || stored.expiresAt < Date.now()) {
      this.challenges.delete(challengeToken);
      throw new BadRequestException('Challenge expired or invalid');
    }
    this.challenges.delete(challengeToken);

    const verification = await verifyRegistrationResponse({
      response: body as any,
      expectedChallenge: stored.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Registration verification failed');
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Store the new credential
    const passkey = this.passkeyRepository.create({
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ?? [],
      label: label ?? null,
    });
    await this.passkeyRepository.save(passkey);

    // Issue JWT session token
    const jwt = this.issueJwt(passkey.id);

    this.logger.log(`Passkey registered: ${passkey.id} (${label ?? 'no label'})`);
    return { verified: true, jwt };
  }

  // ---------- Authentication ----------

  /**
   * Generate authentication options for passkey login.
   */
  async generateAuthenticationOptions(): Promise<{
    options: unknown;
    challengeToken: string;
  }> {
    const { generateAuthenticationOptions } = await getSimpleWebAuthn();

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: 'preferred',
      // Empty allowCredentials = let the authenticator pick (discoverable credentials)
    });

    const challengeToken = this.generateChallengeToken();
    this.challenges.set(challengeToken, {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return { options, challengeToken };
  }

  /**
   * Verify an authentication response and return a JWT.
   */
  async verifyAuthentication(
    challengeToken: string,
    body: unknown,
  ): Promise<{ verified: boolean; jwt?: string }> {
    const { verifyAuthenticationResponse } = await getSimpleWebAuthn();

    const stored = this.challenges.get(challengeToken);
    if (!stored || stored.expiresAt < Date.now()) {
      this.challenges.delete(challengeToken);
      throw new BadRequestException('Challenge expired or invalid');
    }
    this.challenges.delete(challengeToken);

    const credentialId = (body as any)?.id;
    if (!credentialId) {
      throw new BadRequestException('Missing credential ID');
    }

    const passkey = await this.passkeyRepository.findOne({
      where: { credentialId },
    });
    if (!passkey) {
      throw new UnauthorizedException('Unknown credential');
    }

    const verification = await verifyAuthenticationResponse({
      response: body as any,
      expectedChallenge: stored.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: Number(passkey.counter),
        transports: (passkey.transports ?? []) as AuthenticatorTransport[],
      },
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Authentication verification failed');
    }

    // Update counter and last used timestamp
    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.lastUsedAt = new Date();
    await this.passkeyRepository.save(passkey);

    const jwt = this.issueJwt(passkey.id);

    this.logger.log(`Passkey authenticated: ${passkey.id}`);
    return { verified: true, jwt };
  }

  // ---------- Session ----------

  /**
   * Verify a JWT and return the passkey ID if valid.
   */
  verifyJwt(token: string): { passkeyId: string } {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      return { passkeyId: payload.sub };
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  /**
   * Check if any passkeys are registered (used to determine if
   * the app needs initial setup vs. login).
   */
  async hasPasskeys(): Promise<boolean> {
    const count = await this.passkeyRepository.count();
    return count > 0;
  }

  /**
   * List all registered passkeys (for settings page).
   */
  async listPasskeys(): Promise<Array<{ id: string; label: string | null; createdAt: Date; lastUsedAt: Date }>> {
    const passkeys = await this.passkeyRepository.find({
      order: { createdAt: 'ASC' },
    });
    return passkeys.map((p) => ({
      id: p.id,
      label: p.label,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    }));
  }

  // ---------- Helpers ----------

  private issueJwt(passkeyId: string): string {
    return this.jwtService.sign(
      { sub: passkeyId },
      { expiresIn: '30d' }, // Long-lived for household app
    );
  }

  private generateChallengeToken(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
