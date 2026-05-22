// Re-export from the shared context so all existing imports keep working.
// The actual state lives in VaultAuthProvider (providers.tsx), ensuring
// masterKey is derived once and shared across every component.
export { useVaultAuth } from "@/contexts/vault-auth-context"
