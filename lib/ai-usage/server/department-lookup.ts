/** Optional department enrichment for usage events. The standalone Workspace
 * repository does not include an organization directory, so identities stay
 * scoped to the authenticated email and department fields remain empty. */
export interface DepartmentInfo {
  departmentId: string | null;
  departmentName: string | null;
  departmentIds: string[];
}

const EMPTY: DepartmentInfo = { departmentId: null, departmentName: null, departmentIds: [] };

export async function lookupDepartments(emails: string[]): Promise<Map<string, DepartmentInfo>> {
  return new Map(emails.map((email) => [email.trim().toLowerCase(), EMPTY]));
}

export async function lookupDepartment(email: string): Promise<DepartmentInfo> {
  return EMPTY;
}
