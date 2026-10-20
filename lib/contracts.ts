// Tool return shapes from PRD section 4b (Multi-Agent Tool Calling Schema).
// Kept identical to the PRD so Person B / C output can be passed straight into
// the Glass Box and Accountability components.

export type DatasetId = "erm2-nwe9" | "h9gi-nx95";

export type Borough =
  | "Brooklyn"
  | "Manhattan"
  | "Queens"
  | "Bronx"
  | "Staten Island";

export interface ResolveStreetBlockResult {
  blockId: string;
  streetName: string;
  fromCrossStreet: string;
  toCrossStreet: string;
  borough: Borough;
  councilDistrict: number;
  communityBoard: string;
  boundingBoxWKT: string;
}

export interface Query311AccountabilityResult {
  totalComplaints: number;
  openComplaints: number;
  closedNoActionCount: number;
  repeatLocationCount: number;
  medianResponseHours: number;
  topDescriptors: { descriptor: string; count: number }[];
  sourceDatasetId: "erm2-nwe9";
  executedQuery: string;
}

export interface QueryIntersectionCrashesResult {
  totalCrashes: number;
  pedestrianInjuries: number;
  cyclistInjuries: number;
  motoristInjuries: number;
  fatalities: number;
  dataThroughDate: string;
  lagDisclosureNotice: string;
  sourceDatasetId: "h9gi-nx95";
  executedQuery: string;
}

export interface AccountabilityReportSummary {
  total311Volume: number;
  pctClosedNoAction: number;
  chronicRepeatLocations: number;
  medianAgencyResponseHours: number;
  highRiskCorners: string[];
}

export interface GenerateAccountabilityReportResult {
  reportId: string;
  generatedInMs: number;
  summaryMetrics: AccountabilityReportSummary;
  shareableUrl: string;
}
