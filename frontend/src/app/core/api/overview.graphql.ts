import { gql } from 'apollo-angular';

import { Stage } from '../domain/job.model';

/**
 * Everything the overview screen needs, in one request.
 *
 * The REST version of this screen issued ten calls — six stage counts plus overdue,
 * held, rework, and the recent list — which the client then had to stitch together.
 * The rest of the app stays on REST; this is the one screen where the aggregate shape
 * justifies a second API surface.
 */
export const OVERVIEW_QUERY = gql`
  query Overview {
    overview {
      total
      overdue
      held
      rework
      stages {
        stage
        label
        count
      }
      recent {
        id
        jobNumber
        customerName
        stage
        siteCity
        siteState
        onHold
      }
    }
  }
`;

export interface OverviewStageCount {
  stage: Stage;
  label: string;
  count: number;
}

export interface OverviewRecentJob {
  id: string;
  jobNumber: string;
  customerName: string;
  stage: Stage;
  siteCity: string;
  siteState: string;
  onHold: boolean;
}

export interface Overview {
  total: number;
  overdue: number;
  held: number;
  rework: number;
  stages: OverviewStageCount[];
  recent: OverviewRecentJob[];
}

export interface OverviewQueryResult {
  overview: Overview;
}
