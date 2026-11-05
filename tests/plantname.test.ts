import { describe, expect, it } from 'vitest';
import { cleanPlantName } from '../src/ui/menu';

describe('Anlagenname', () => {
  it('wird gesäubert, gekürzt und leer zu undefined', () => {
    expect(cleanPlantName('  Biogas   Lindenhof ')).toBe('Biogas Lindenhof');
    expect(cleanPlantName('   ')).toBeUndefined();
    expect(cleanPlantName('a\u0000b\nc')).toBe('a b c');
    expect(cleanPlantName('x'.repeat(80))).toHaveLength(40);
  });
});
