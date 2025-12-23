import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyApkSignature } from '../verify-apk-signature.js';
import * as core from '@hitoshura25/core';
import * as fs from 'fs';

vi.mock('@hitoshura25/core', async () => {
  const actual = await vi.importActual('@hitoshura25/core');
  return {
    ...actual,
    execCommand: vi.fn(),
  };
});

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('verifyApkSignature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should verify APK signature with apksigner', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: `
        Verified using v1 scheme (JAR signing): true
        Verified using v2 scheme (APK Signature Scheme v2): true
        Verified using v3 scheme (APK Signature Scheme v3): true
        Signer #1 certificate DN: CN=Production, O=Company
        Valid from: 2024-01-01
        Valid until: 2034-01-01
      `,
      stderr: '',
      durationMs: 1000,
      timedOut: false,
    });

    const result = await verifyApkSignature({
      apk_path: '/path/to/app.apk',
    });

    expect(result.success).toBe(true);
    expect(result.data?.signed).toBe(true);
    expect(result.data?.verified).toBe(true);
    expect(result.data?.scheme_versions).toContain(1);
    expect(result.data?.scheme_versions).toContain(2);
    expect(result.data?.scheme_versions).toContain(3);
    expect(result.data?.signer_info.cn).toBe('Production');
    expect(result.data?.signer_info.organization).toBe('Company');
  });

  it('should fail when APK does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await verifyApkSignature({
      apk_path: '/nonexistent/app.apk',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('APK_NOT_FOUND');
    expect(result.error?.suggestions).toContain('Check if APK path is correct');
  });

  it('should fallback to jarsigner when apksigner fails', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // apksigner fails, jarsigner succeeds
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'apksigner not found',
        durationMs: 100,
        timedOut: false,
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: `
          jar verified.
          CN=Production, O=Company
        `,
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

    const result = await verifyApkSignature({
      apk_path: '/path/to/app.apk',
    });

    expect(result.success).toBe(true);
    expect(result.data?.signed).toBe(true);
    expect(result.data?.scheme_versions).toEqual([1]); // jarsigner only supports v1
    expect(result.steps_completed).toContain('signature_verified_jarsigner');
  });

  it('should fail when both tools fail', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Verification failed',
      durationMs: 100,
      timedOut: false,
    });

    const result = await verifyApkSignature({
      apk_path: '/path/to/app.apk',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VERIFICATION_FAILED');
    expect(result.error?.suggestions.some(s => s.includes('Android SDK'))).toBe(true);
  });
});
