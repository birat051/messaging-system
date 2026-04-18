import { describe, expect, it } from 'vitest';
import { anonymousGetObjectBucketPolicyJson } from './ensureBucket.js';

describe('anonymousGetObjectBucketPolicyJson', () => {
  it('allows GetObject on all objects in the bucket', () => {
    const parsed = JSON.parse(
      anonymousGetObjectBucketPolicyJson('messaging-media'),
    ) as {
      Version: string;
      Statement: Array<{
        Effect: string;
        Principal: string;
        Action: string;
        Resource: string;
      }>;
    };
    expect(parsed.Version).toBe('2012-10-17');
    expect(parsed.Statement).toHaveLength(1);
    const [s] = parsed.Statement;
    expect(s.Effect).toBe('Allow');
    expect(s.Principal).toBe('*');
    expect(s.Action).toBe('s3:GetObject');
    expect(s.Resource).toBe('arn:aws:s3:::messaging-media/*');
  });
});
