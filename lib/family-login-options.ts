export const familyIdentities = ["Christoph", "Peter", "Philipp", "Teresa", "Franziska"] as const;

export type FamilyIdentityName = (typeof familyIdentities)[number];
