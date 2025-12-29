import { execCommand } from '@hitoshura25/core';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface KeystoreConfig {
  path: string;
  password: string;
  alias: string;
  keyPassword: string;
}

/**
 * Generates a test keystore for Android signing
 * Uses keytool to create a self-signed certificate
 */
export async function generateTestKeystore(outputDir: string): Promise<KeystoreConfig> {
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const keystorePath = join(outputDir, 'test-release.keystore');
  const config: KeystoreConfig = {
    path: keystorePath,
    password: 'testpass123',
    alias: 'testkey',
    keyPassword: 'testpass123',
  };

  // Skip generation if keystore already exists
  if (existsSync(keystorePath)) {
    console.log(`[keystore-generator] Keystore already exists at ${keystorePath}`);
    return config;
  }

  // Generate keystore using keytool
  console.log(`[keystore-generator] Generating keystore at ${keystorePath}...`);
  const keytoolCmd = [
    'keytool',
    '-genkeypair',
    '-v',
    `-keystore "${keystorePath}"`,
    `-alias ${config.alias}`,
    `-keyalg RSA`,
    `-keysize 2048`,
    `-validity 10000`,
    `-storepass ${config.password}`,
    `-keypass ${config.keyPassword}`,
    `-dname "CN=Test, OU=Test, O=Test, L=Test, S=Test, C=US"`,
  ].join(' ');

  const result = await execCommand(keytoolCmd, {
    timeout: 30000,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to generate keystore: ${result.stderr}`);
  }

  console.log(`[keystore-generator] Keystore generated successfully`);
  return config;
}
