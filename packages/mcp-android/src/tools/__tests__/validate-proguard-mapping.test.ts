import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateProguardMapping } from '../validate-proguard-mapping.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

describe('validateProguardMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate a good ProGuard mapping file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 50000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(`
com.example.MyClass -> a.a.a:
    void myMethod() -> a
    int myField -> b
com.example.AnotherClass -> a.a.b:
    void anotherMethod() -> a
    `);

    const result = await validateProguardMapping({
      project_path: '/fake/project',
      module: 'app',
      build_type: 'release',
    });

    expect(result.success).toBe(true);
    expect(result.data?.exists).toBe(true);
    expect(result.data?.size_bytes).toBe(50000);
    expect(result.data?.classes_mapped).toBeGreaterThan(0);
    expect(result.data?.methods_mapped).toBeGreaterThan(0);
  });

  it('should fail when mapping file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await validateProguardMapping({
      project_path: '/fake/project',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MAPPING_NOT_FOUND');
    expect(result.error?.suggestions).toContain('Ensure minifyEnabled is set to true in build.gradle.kts');
  });

  it('should fail when mapping file is too small', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('# Empty mapping');

    const result = await validateProguardMapping({
      project_path: '/fake/project',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MAPPING_TOO_SMALL');
    expect(result.error?.suggestions.some(s => s.includes('ProGuard rules'))).toBe(true);
  });

  it('should count classes and methods correctly', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 10000 } as fs.Stats);

    const mappingContent = `
com.example.Class1 -> a.a:
    void method1() -> a
    void method2() -> b
com.example.Class2 -> a.b:
    int field1 -> a
    void method3() -> b
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(mappingContent);

    const result = await validateProguardMapping({
      project_path: '/fake/project',
    });

    expect(result.success).toBe(true);
    expect(result.data?.classes_mapped).toBe(2);
    expect(result.data?.methods_mapped).toBe(4); // 2 methods + 2 fields
  });
});
