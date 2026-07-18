export const PLATFORM_COMMISSION_BPS = Number(process.env.PLATFORM_COMMISSION_BPS ?? 1750);

export function splitPayout(grossAmount: number) {
  const commissionAmount = Math.round((grossAmount * PLATFORM_COMMISSION_BPS) / 10000);
  const creatorAmount = grossAmount - commissionAmount;
  return { commissionAmount, creatorAmount };
}
