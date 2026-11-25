import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { resetConnectivityForTests } from '../shared/offline/connectivity'
import { resetServerChangesForTests } from '../shared/offline/serverChanges'
import { storageClear } from '../shared/offline/storage'

afterEach(async () => {
  cleanup()
  // Copie hors ligne et état du réseau propres à chaque test (stockage en mémoire sous jsdom).
  await storageClear()
  resetConnectivityForTests()
  resetServerChangesForTests()
  delete window.jbDesktop
})
