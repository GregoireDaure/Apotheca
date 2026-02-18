import { Controller, Get, Post, Body, Query, Param, Res, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

const COOKIE_NAME = 'mm_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Check if any passkeys exist (determines setup vs login flow).
   */
  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Check auth status — has passkeys? is authenticated?' })
  async status(@Req() req: Request) {
    const hasPasskeys = await this.authService.hasPasskeys();
    const token = req.cookies?.[COOKIE_NAME];
    let authenticated = false;

    if (token) {
      try {
        this.authService.verifyJwt(token);
        authenticated = true;
      } catch {
        // Token invalid — not authenticated
      }
    }

    return { hasPasskeys, authenticated };
  }

  // ---------- Registration ----------

  @Public()
  @Get('register/options')
  @ApiOperation({ summary: 'Generate WebAuthn registration options' })
  async registrationOptions(@Query('label') label?: string) {
    return this.authService.generateRegistrationOptions(label);
  }

  @Public()
  @Post('register/verify')
  @ApiOperation({ summary: 'Verify WebAuthn registration and store passkey' })
  async verifyRegistration(
    @Body() body: { challengeToken: string; credential: unknown; label?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyRegistration(
      body.challengeToken,
      body.credential,
      body.label,
    );

    if (result.jwt) {
      res.cookie(COOKIE_NAME, result.jwt, COOKIE_OPTIONS);
    }

    return { verified: result.verified };
  }

  // ---------- Authentication ----------

  @Public()
  @Get('login/options')
  @ApiOperation({ summary: 'Generate WebAuthn authentication options' })
  async authenticationOptions() {
    return this.authService.generateAuthenticationOptions();
  }

  @Public()
  @Post('login/verify')
  @ApiOperation({ summary: 'Verify WebAuthn authentication and issue session' })
  async verifyAuthentication(
    @Body() body: { challengeToken: string; credential: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyAuthentication(
      body.challengeToken,
      body.credential,
    );

    if (result.jwt) {
      res.cookie(COOKIE_NAME, result.jwt, COOKIE_OPTIONS);
    }

    return { verified: result.verified };
  }

  // ---------- Invite ----------

  @Post('invite')
  @ApiOperation({ summary: 'Generate a 10-minute invite code for a new household member' })
  createInvite() {
    return this.authService.createInvite();
  }

  @Public()
  @Get('invite/:code/validate')
  @ApiOperation({ summary: 'Check if an invite code is still valid' })
  validateInvite(@Param('code') code: string) {
    return this.authService.validateInvite(code);
  }

  @Public()
  @Get('invite/:code/register/options')
  @ApiOperation({ summary: 'Generate registration options using an invite code' })
  async inviteRegistrationOptions(
    @Param('code') code: string,
    @Query('label') label?: string,
  ) {
    const { valid } = this.authService.validateInvite(code);
    if (!valid) {
      throw new BadRequestException('Invite code is invalid or expired');
    }
    return this.authService.generateRegistrationOptions(label);
  }

  @Public()
  @Post('invite/:code/register/verify')
  @ApiOperation({ summary: 'Verify registration and consume invite code' })
  async inviteVerifyRegistration(
    @Param('code') code: string,
    @Body() body: { challengeToken: string; credential: unknown; label?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const consumed = this.authService.consumeInvite(code);
    if (!consumed) {
      throw new BadRequestException('Invite code is invalid or expired');
    }

    const result = await this.authService.verifyRegistration(
      body.challengeToken,
      body.credential,
      body.label,
    );

    if (result.jwt) {
      res.cookie(COOKIE_NAME, result.jwt, COOKIE_OPTIONS);
    }

    return { verified: result.verified };
  }

  // ---------- Session ----------

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Clear session cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Get('passkeys')
  @ApiOperation({ summary: 'List registered passkeys' })
  async listPasskeys() {
    return this.authService.listPasskeys();
  }
}
