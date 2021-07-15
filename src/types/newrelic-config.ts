import { AlertsSet } from '../constants/alerts-set'
import { AlertType } from './alert'

export type NewRelicConfig = {
  policyServiceToken: string
  customPolicyName: string
  infrastructureConditionServiceToken: string
  incidentPreference?: string
  violationCloseTimer?: number
  alerts?: (AlertType | AlertsSet)[]
}
