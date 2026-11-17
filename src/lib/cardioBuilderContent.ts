import specFile from '../../content/cardio/cardio-builder.json';

import type { CardioMachineId, CardioPlan } from '@/lib/cardio';
import {
  buildQuickCardioPlan as buildFromSpec,
  parseCardioBuilderSpec,
  type BuildQuickCardioPlanInput,
} from '@/lib/cardioBuilder';
import { cardioCopy } from '@/lib/copy';

export {
  effortSettingsBand,
  machineImageSlug,
  nameQuickCardioPlan,
  parseCardioBuilderSpec,
  quickStartMinutesOptions,
  settingsForEffort,
  type BuildQuickCardioPlanInput,
  type CardioBuilderSpec,
  type QuickStartStyle,
} from '@/lib/cardioBuilder';

export const cardioBuilderSpec = parseCardioBuilderSpec(specFile);

export function builderMachineLabel(id: CardioMachineId): string {
  if (id === 'treadmill') return cardioCopy.machine_treadmill;
  if (id === 'bike') return cardioCopy.machine_bike;
  if (id === 'cross_trainer') return cardioCopy.machine_cross_trainer;
  if (id === 'rower') return cardioCopy.machine_rower;
  if (id === 'stair_climber') return cardioCopy.machine_stair_climber;
  return cardioCopy.machine_mixed;
}

export function buildQuickCardioPlan(input: BuildQuickCardioPlanInput): CardioPlan {
  return buildFromSpec(input, cardioBuilderSpec, builderMachineLabel(input.machineId));
}
