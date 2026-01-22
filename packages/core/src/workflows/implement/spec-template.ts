/**
 * Specification template generation for implementation workflow
 */

/**
 * Generate a spec template for a new feature
 */
export function generateSpecTemplate(
  description: string,
  projectPath: string,
  languageName: string
): string {
  const timestamp = new Date().toISOString();

  return `# Implementation Spec: ${description}

> Generated: ${timestamp}
> Project: ${projectPath}
> Environment: ${languageName}

## Overview

**Objective:** ${description}

**Scope:** [Define what is in scope and out of scope]

## Requirements

### Functional Requirements

1. [Requirement 1]
2. [Requirement 2]
3. [Requirement 3]

### Non-Functional Requirements

- [ ] Performance: [Specify any performance requirements]
- [ ] Security: [Specify any security requirements]
- [ ] Compatibility: [Specify any compatibility requirements]

## Technical Design

### Architecture

[Describe the high-level architecture]

### Components

1. **[Component 1]**
   - Purpose:
   - Interface:

2. **[Component 2]**
   - Purpose:
   - Interface:

### Data Flow

[Describe how data flows through the system]

## Implementation Plan

### Phase 1: [Phase Name]
- [ ] Task 1
- [ ] Task 2

### Phase 2: [Phase Name]
- [ ] Task 1
- [ ] Task 2

## Testing Strategy

### Unit Tests
- [ ] [Test case 1]
- [ ] [Test case 2]

### Integration Tests
- [ ] [Test case 1]
- [ ] [Test case 2]

### Edge Cases
- [ ] [Edge case 1]
- [ ] [Edge case 2]

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk 1] | [Impact] | [Mitigation] |

## Open Questions

- [ ] [Question 1]
- [ ] [Question 2]

---

## Review Feedback

### Gemini Review
> [Will be populated after review]

### OLMo Review
> [Will be populated after review]

### Synthesis
> [Will be populated after reviews complete]
`;
}

/**
 * Generate a filename from a description
 */
export function getSpecFileName(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  return `${slug}.md`;
}
