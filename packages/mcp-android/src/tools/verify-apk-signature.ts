import { execCommand, ToolResult } from '@hitoshura25/core';
import { existsSync } from 'fs';

export interface VerifySignatureParams {
  apk_path: string;
  expected_alias?: string;
}

export interface SignerInfo {
  alias?: string;
  cn: string;
  organization?: string;
  valid_from: string;
  valid_until: string;
}

export interface VerifySignatureResult {
  signed: boolean;
  verified: boolean;
  scheme_versions: number[];
  signer_info: SignerInfo;
}

export async function verifyApkSignature(
  params: VerifySignatureParams
): Promise<ToolResult<VerifySignatureResult>> {
  const startTime = Date.now();
  const steps: string[] = [];

  // 1. Verify APK exists
  if (!existsSync(params.apk_path)) {
    return {
      success: false,
      error: {
        code: 'APK_NOT_FOUND',
        message: `APK not found at path: ${params.apk_path}`,
        suggestions: ['Check if APK path is correct', 'Build APK first using validate_release_build'],
        recoverable: false,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
  steps.push('apk_found');

  // 2. Try to use apksigner first (preferred, part of Android SDK)
  const apksignerResult = await execCommand(`apksigner verify --verbose --print-certs "${params.apk_path}"`, {
    timeout: 30000,
  });

  if (apksignerResult.exitCode === 0) {
    // Parse apksigner output
    const output = apksignerResult.stdout;
    const verified = output.includes('Verified using');

    // Extract signing scheme versions
    const schemeVersions: number[] = [];
    if (output.includes('v1')) schemeVersions.push(1);
    if (output.includes('v2')) schemeVersions.push(2);
    if (output.includes('v3')) schemeVersions.push(3);
    if (output.includes('v4')) schemeVersions.push(4);

    // Extract signer info
    const cnMatch = output.match(/CN=([^,\n]+)/);
    const orgMatch = output.match(/O=([^,\n]+)/);
    const validFromMatch = output.match(/Valid from: ([^\n]+)/);
    const validUntilMatch = output.match(/Valid until: ([^\n]+)/);

    const signerInfo: SignerInfo = {
      cn: cnMatch?.[1]?.trim() ?? 'Unknown',
      organization: orgMatch?.[1]?.trim(),
      valid_from: validFromMatch?.[1]?.trim() ?? 'Unknown',
      valid_until: validUntilMatch?.[1]?.trim() ?? 'Unknown',
    };

    steps.push('signature_verified');

    return {
      success: true,
      data: {
        signed: true,
        verified,
        scheme_versions: schemeVersions,
        signer_info: signerInfo,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  // 3. Fallback to jarsigner if apksigner not available
  const jarsignerResult = await execCommand(`jarsigner -verify -verbose -certs "${params.apk_path}"`, {
    timeout: 30000,
  });

  if (jarsignerResult.exitCode === 0) {
    const output = jarsignerResult.stdout + jarsignerResult.stderr;
    const verified = output.includes('jar verified');

    // Extract certificate info from jarsigner output
    const cnMatch = output.match(/CN=([^,\n]+)/);
    const orgMatch = output.match(/O=([^,\n]+)/);

    const signerInfo: SignerInfo = {
      cn: cnMatch?.[1]?.trim() ?? 'Unknown',
      organization: orgMatch?.[1]?.trim(),
      valid_from: 'Unknown',
      valid_until: 'Unknown',
    };

    steps.push('signature_verified_jarsigner');

    return {
      success: true,
      data: {
        signed: true,
        verified,
        scheme_versions: [1], // jarsigner only supports v1
        signer_info: signerInfo,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  // 4. Neither tool worked
  return {
    success: false,
    error: {
      code: 'VERIFICATION_FAILED',
      message: 'Failed to verify APK signature',
      details: `apksigner error: ${apksignerResult.stderr}\njarsigner error: ${jarsignerResult.stderr}`,
      suggestions: [
        'Ensure Android SDK build-tools are installed (for apksigner)',
        'Ensure Java JDK is installed (for jarsigner)',
        'Check if APK is actually signed',
      ],
      recoverable: true,
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
