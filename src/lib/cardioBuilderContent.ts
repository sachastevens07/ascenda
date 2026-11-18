import specFile from '../../content/cardio/cardio-builder.json';

import type { CardioMachineId, CardioPlan } from '@/lib/cardio';
import {
  buildCardioPlan as buildFromSpec,
  parseCardioBuilderSpec,
  type BuildCardioPlanInput,
  type BuildQuickCardioPlanInput,
} from '@/lib/cardioBuilder';
import { cardioCopy } from '@/lib/copy';

export {
  cardioMinutesCountTowardWeek,
  cardioPlanLength,
  effortSettingsBand,
  formatPlanMinutes,
  isEffortTipBeginner,
  justLogDateIsos,
  machineImageSlug,
  nameQuickCardioPlan,
  parseCardioBuilderSpec,
  quickStartMinutesOptions,
  settingsForEffort,
  type BuildCardioPlanInput,
  type BuildQuickCardioPlanInput,
  type CardioBuilderSpec,
  type ExtraCardioBlock,
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

export function buildCardioPlan(input: BuildCardioPlanInput): CardioPlan {
  return buildFromSpec(input, cardioBuilderSpec, builderMachineLabel(input.machineId));
}
