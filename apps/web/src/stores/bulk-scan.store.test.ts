import { describe, it, expect, beforeEach } from 'vitest'
import { useBulkScanStore } from './bulk-scan.store'

// We test the Zustand store directly via getState/setState
describe('useBulkScanStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useBulkScanStore.setState({
      active: false,
      direction: 'add',
      items: [],
    })
  })

  it('should start a session', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')

    const state = useBulkScanStore.getState()
    expect(state.active).toBe(true)
    expect(state.direction).toBe('add')
    expect(state.items).toEqual([])
  })

  it('should start a session with remove direction', () => {
    const store = useBulkScanStore.getState()
    store.startSession('remove')

    const state = useBulkScanStore.getState()
    expect(state.active).toBe(true)
    expect(state.direction).toBe('remove')
  })

  it('should add an item', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')
    store.addItem({
      cis: '60001234',
      denomination: 'Doliprane',
      pharmaceuticalForm: 'comprimé',
      expiryDate: null,
      batchNumber: null,
      alreadyInInventory: false,
    })

    const state = useBulkScanStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].cis).toBe('60001234')
    expect(state.items[0].status).toBe('pending')
  })

  it('should not add duplicate CIS codes', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')

    const itemData = {
      cis: '60001234',
      denomination: 'Doliprane',
      pharmaceuticalForm: 'comprimé',
      expiryDate: null,
      batchNumber: null,
      alreadyInInventory: false,
    }

    store.addItem(itemData)
    store.addItem(itemData) // duplicate

    const state = useBulkScanStore.getState()
    expect(state.items).toHaveLength(1)
  })

  it('should remove an item by id', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')
    store.addItem({
      cis: '60001234',
      denomination: 'Doliprane',
      pharmaceuticalForm: 'comprimé',
      expiryDate: null,
      batchNumber: null,
      alreadyInInventory: false,
    })

    const itemId = useBulkScanStore.getState().items[0].id
    store.removeItem(itemId)

    expect(useBulkScanStore.getState().items).toHaveLength(0)
  })

  it('should mark an item as confirmed', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')
    store.addItem({
      cis: '60001234',
      denomination: 'Doliprane',
      pharmaceuticalForm: 'comprimé',
      expiryDate: null,
      batchNumber: null,
      alreadyInInventory: false,
    })

    const itemId = useBulkScanStore.getState().items[0].id
    store.markConfirmed(itemId)

    expect(useBulkScanStore.getState().items[0].status).toBe('confirmed')
  })

  it('should mark an item as error', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')
    store.addItem({
      cis: '60001234',
      denomination: 'Doliprane',
      pharmaceuticalForm: 'comprimé',
      expiryDate: null,
      batchNumber: null,
      alreadyInInventory: false,
    })

    const itemId = useBulkScanStore.getState().items[0].id
    store.markError(itemId, 'API timeout')

    const item = useBulkScanStore.getState().items[0]
    expect(item.status).toBe('error')
    expect(item.errorMessage).toBe('API timeout')
  })

  it('should end session and clear state', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')
    store.addItem({
      cis: '60001234',
      denomination: 'Doliprane',
      pharmaceuticalForm: 'comprimé',
      expiryDate: null,
      batchNumber: null,
      alreadyInInventory: false,
    })

    store.endSession()

    const state = useBulkScanStore.getState()
    expect(state.active).toBe(false)
    expect(state.items).toEqual([])
  })

  it('should toggle direction', () => {
    const store = useBulkScanStore.getState()
    store.startSession('add')
    expect(useBulkScanStore.getState().direction).toBe('add')

    store.setDirection('remove')
    expect(useBulkScanStore.getState().direction).toBe('remove')
  })
})
