/** A retry of an already accepted client change is safe; divergent base versions are not. */
export const isVersionConflict = (remoteUpdatedAt: unknown, baseUpdatedAt?: string) =>
  Boolean(remoteUpdatedAt && baseUpdatedAt && remoteUpdatedAt !== baseUpdatedAt)
