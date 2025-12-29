import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ProjectInfo {
  type: ProjectType;
  root: string;
  indicators: string[]; // Files that identified this type
  metadata: Record<string, unknown>;
}

export type ProjectType =
  | 'android-kotlin'
  | 'android-java'
  | 'python-uv'
  | 'python-pip'
  | 'node-typescript'
  | 'node-javascript'
  | 'unknown';

export async function detectProjectType(path: string): Promise<ProjectInfo> {
  const indicators: string[] = [];
  let type: ProjectType = 'unknown';
  const metadata: Record<string, unknown> = {};

  // Check for Android project
  const buildGradleKts = join(path, 'build.gradle.kts');
  const buildGradle = join(path, 'build.gradle');
  const settingsGradleKts = join(path, 'settings.gradle.kts');
  const settingsGradle = join(path, 'settings.gradle');

  if (
    existsSync(buildGradleKts) ||
    existsSync(buildGradle) ||
    existsSync(settingsGradleKts) ||
    existsSync(settingsGradle)
  ) {
    const androidManifest = join(path, 'app', 'src', 'main', 'AndroidManifest.xml');
    if (existsSync(androidManifest)) {
      indicators.push('AndroidManifest.xml');

      // Determine if Kotlin or Java
      const hasKotlin = existsSync(join(path, 'app', 'src', 'main', 'kotlin')) ||
        (existsSync(buildGradleKts) && readFileSync(buildGradleKts, 'utf-8').includes('kotlin'));

      type = hasKotlin ? 'android-kotlin' : 'android-java';

      if (existsSync(buildGradleKts)) {
        indicators.push('build.gradle.kts');
      } else if (existsSync(buildGradle)) {
        indicators.push('build.gradle');
      }
    }
  }

  // Check for Python project
  if (existsSync(join(path, 'pyproject.toml'))) {
    indicators.push('pyproject.toml');
    const content = readFileSync(join(path, 'pyproject.toml'), 'utf-8');
    type = content.includes('uv') ? 'python-uv' : 'python-pip';
  } else if (existsSync(join(path, 'requirements.txt'))) {
    indicators.push('requirements.txt');
    type = 'python-pip';
  }

  // Check for Node project
  if (existsSync(join(path, 'package.json'))) {
    indicators.push('package.json');
    const hasTypeScript = existsSync(join(path, 'tsconfig.json'));
    type = hasTypeScript ? 'node-typescript' : 'node-javascript';

    if (hasTypeScript) {
      indicators.push('tsconfig.json');
    }
  }

  return {
    type,
    root: path,
    indicators,
    metadata,
  };
}

export interface AndroidProjectInfo {
  packageName: string;
  minSdk: number;
  targetSdk: number;
  modules: string[];
  hasKotlin: boolean;
  buildSystem: 'gradle-kotlin' | 'gradle-groovy';
}

export async function detectAndroidProject(
  path: string
): Promise<AndroidProjectInfo | null> {
  const buildGradleKts = join(path, 'app', 'build.gradle.kts');
  const buildGradle = join(path, 'app', 'build.gradle');
  const androidManifest = join(path, 'app', 'src', 'main', 'AndroidManifest.xml');

  // Check if this is an Android project
  if (!existsSync(androidManifest)) {
    return null;
  }

  const buildSystem: 'gradle-kotlin' | 'gradle-groovy' = existsSync(buildGradleKts)
    ? 'gradle-kotlin'
    : 'gradle-groovy';
  const buildFile = buildSystem === 'gradle-kotlin' ? buildGradleKts : buildGradle;

  if (!existsSync(buildFile)) {
    return null;
  }

  // Parse AndroidManifest.xml for package name
  const manifestContent = readFileSync(androidManifest, 'utf-8');
  const packageMatch = manifestContent.match(/package="([^"]+)"/);
  const packageName = packageMatch?.[1] ?? 'com.example.app';

  // Parse build.gradle for SDK versions
  const buildContent = readFileSync(buildFile, 'utf-8');
  const minSdkMatch = buildContent.match(/minSdk\s*=\s*(\d+)/);
  const targetSdkMatch = buildContent.match(/targetSdk\s*=\s*(\d+)/);

  const minSdk = minSdkMatch ? parseInt(minSdkMatch[1]) : 21;
  const targetSdk = targetSdkMatch ? parseInt(targetSdkMatch[1]) : 34;

  // Check for Kotlin
  const hasKotlin =
    buildContent.includes('kotlin') ||
    existsSync(join(path, 'app', 'src', 'main', 'kotlin'));

  // Simple module detection (just check for app module for now)
  const modules = ['app'];

  return {
    packageName,
    minSdk,
    targetSdk,
    modules,
    hasKotlin,
    buildSystem,
  };
}
