import Serverless from 'serverless'
import { ApiGatewayAlert, DynamoDbAlert, FunctionAlert, SqsAlert } from '../src/constants/alerts'
import { AlertsSet } from '../src/constants/alerts-set'

const NewRelicPlugin = require('../src')

describe('Newrelic Alert Plugin', () => {
  const logMock = jest.fn()
  const getServerless = (config: any, { resources, functions = [] }: any = {}): Serverless =>
    ({
      service: {
        custom: {
          newrelic: config
        },
        provider: {
          compiledCloudFormationTemplate: {
            Resources: resources
          }
        },
        getServiceName() {
          return 'test service'
        },
        getAllFunctionsNames() {
          return functions.map(({ displayName }) => displayName)
        },
        getAllFunctions() {
          return functions.map(({ name }) => name)
        },
        getFunction(functionName) {
          const fn = functions.find(({ name }) => name === functionName)
          return {
            alerts: fn.alerts,
            name: fn.displayName
          }
        }
      },
      getProvider() {
        return {
          getStage() {
            return 'test'
          }
        }
      },
      cli: {
        log: logMock
      }
    } as any)

  const minimalConfig = {
    policyServiceToken: 'policy-token',
    infrastructureConditionServiceToken: 'infrastructure-condition-token'
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should throw error if some of tokens are not provided', () => {
      expect(() => new NewRelicPlugin(getServerless({}))).toThrow()
    })

    it("shouldn't apply hooks if there is no plugin config", () => {
      const plugin = new NewRelicPlugin(getServerless(undefined))
      expect(plugin.hooks).toEqual({})
    })
  })

  describe('getPolicyCloudFormation', () => {
    it('should generate valid policy', () => {
      const plugin = new NewRelicPlugin(getServerless(minimalConfig))
      const policy = plugin.getPolicyCloudFormation()
      expect(policy).toMatchSnapshot()
    })
  })

  describe('getInfrastructureConditionCloudFormation', () => {
    it('should throw error with invalid infrastructure conditions', () => {
      const plugin = new NewRelicPlugin(getServerless(minimalConfig))

      try {
        const infrastructureCondition = plugin.getInfrastructureConditionCloudFormation(
          FunctionAlert.THROTTLES,
          ['fn-1', 'fn-2']
        )
      } catch (error) {
        expect(error).toHaveProperty('message', 'Unknown alert')
      }
    })
  })

  describe('getFunctionAlertsCloudFormation', () => {
    it('should generate global alerts for all functions', () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: Object.values(FunctionAlert)
          },
          {
            functions: [
              {
                name: 'test-function',
                displayName: 'test-service-test-function'
              },
              {
                name: 'test-function-2',
                displayName: 'test-service-test-function-2'
              }
            ]
          }
        )
      )
      const cf = plugin.getFunctionAlertsCloudFormation()
      expect(cf).toMatchSnapshot()
    })

    it('should generate local defined alerts functions', () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig
          },
          {
            functions: [
              {
                name: 'test-function',
                displayName: 'test-service-test-function'
              },
              {
                name: 'test-function-2',
                displayName: 'test-service-test-function-2',
                alerts: [FunctionAlert.DURATION_1_SEC]
              }
            ]
          }
        )
      )
      const cf = plugin.getFunctionAlertsCloudFormation()
      expect(cf).toMatchSnapshot()
    })

    it("shouldn't fail if there are no functions", () => {
      const plugin = new NewRelicPlugin(
        getServerless({
          ...minimalConfig,
          alerts: [...Object.values(FunctionAlert), ...Object.values(ApiGatewayAlert)]
        })
      )
      const cf = plugin.getFunctionAlertsCloudFormation()
      expect(cf).toEqual({})
    })

    it("shouldn't fail if there are no alerts", () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: Object.values(ApiGatewayAlert)
          },
          {
            functions: [
              {
                name: 'test-function',
                displayName: 'test-service-test-function'
              }
            ]
          }
        )
      )
      const cf = plugin.getFunctionAlertsCloudFormation()
      expect(cf).toEqual({})
    })
  })

  describe('getApiGatewayAlertsCloudFormation', () => {
    it('should generate alerts for all api gateways', () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: [...Object.values(FunctionAlert), ...Object.values(ApiGatewayAlert)]
          },
          {
            resources: {
              ApiGateway: {
                Type: 'AWS::ApiGateway::RestApi',
                Properties: {
                  Name: 'api-gatway'
                }
              },
              ApiGateway2: {
                Type: 'AWS::ApiGateway::RestApi',
                Properties: {
                  Name: 'api-gatway2'
                }
              }
            }
          }
        )
      )
      const cf = plugin.getAlertsCloudFormation('AWS::ApiGateway::RestApi')
      expect(cf).toMatchSnapshot()
    })

    it("shouldn't fail if there are no api gateways", () => {
      const plugin = new NewRelicPlugin(
        getServerless({
          ...minimalConfig,
          alerts: [...Object.values(FunctionAlert), ...Object.values(ApiGatewayAlert)]
        })
      )
      const cf = plugin.getAlertsCloudFormation('AWS::ApiGateway::RestApi')
      expect(cf).toEqual({})
    })

    it("shouldn't fail if there are no alerts", () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: Object.values(FunctionAlert)
          },
          {
            resources: {
              ApiGateway: {
                Type: 'AWS::ApiGateway::RestApi',
                Properties: {
                  Name: 'api-gatway'
                }
              }
            }
          }
        )
      )
      const cf = plugin.getAlertsCloudFormation('AWS::ApiGateway::RestApi')
      expect(cf).toEqual({})
    })
  })

  describe('getSqsAlertsCloudFormation', () => {
    it('should generate alerts for all dead letter queues', () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: [
              ...Object.values(DynamoDbAlert),
              {
                type: SqsAlert.DLQ_VISIBLE_MESSAGES,
                filter: '-dlq'
              }
            ]
          },
          {
            resources: {
              Queue: {
                Type: 'AWS::SQS::Queue',
                Properties: {
                  QueueName: 'simple-queue'
                }
              },
              QueueDlq: {
                Type: 'AWS::SQS::Queue',
                Properties: {
                  QueueName: 'simple-queue-dlq'
                }
              }
            }
          }
        )
      )
      const cf = plugin.getAlertsCloudFormation('AWS::SQS::Queue')
      expect(cf).toMatchSnapshot()
    })

    it("shouldn't fail if there are no dead letter queues", () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: [
              {
                type: SqsAlert.DLQ_VISIBLE_MESSAGES,
                filter: '-dlq'
              }
            ]
          },
          {
            resources: {
              Queue: {
                Type: 'AWS::SQS::Queue',
                Properties: {
                  QueueName: 'simple-queue'
                }
              }
            }
          }
        )
      )
      const cf = plugin.getAlertsCloudFormation('AWS::SQS::Queue')
      expect(cf).toEqual({})
    })

    it("shouldn't fail if there are no alerts", () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: Object.values(FunctionAlert)
          },
          {
            resources: {
              QueueDlq: {
                Type: 'AWS::SQS::Queue',
                Properties: {
                  QueueName: 'simple-queue-dlq'
                }
              }
            }
          }
        )
      )
      const cf = plugin.getAlertsCloudFormation('AWS::SQS::Queue')
      expect(cf).toEqual({})
    })
  })

  describe('getDynamoDbAlertsCloudFormation', () => {
    it('should generate alerts for all dynamo tables', () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: [...Object.values(DynamoDbAlert), ...Object.values(ApiGatewayAlert)]
          },
          {
            resources: {
              DynamoDBTable: {
                Type: 'AWS::DynamoDB::Table',
                Properties: {
                  TableName: 'dynamo-table'
                }
              },
              DynamoDBTable2: {
                Type: 'AWS::DynamoDB::Table',
                Properties: {
                  TableName: 'dynamo-table2'
                }
              }
            }
          }
        )
      )
      const cf = plugin.getAlertsCloudFormation('AWS::DynamoDB::Table')
      expect(cf).toMatchSnapshot()
    })

    it("shouldn't fail if there are no dynamo tables", () => {
      const plugin = new NewRelicPlugin(
        getServerless({
          ...minimalConfig,
          alerts: [...Object.values(DynamoDbAlert), ...Object.values(ApiGatewayAlert)]
        })
      )
      const cf = plugin.getAlertsCloudFormation('AWS::DynamoDB::Table')
      expect(cf).toEqual({})
    })

    it("shouldn't fail if there are no alerts", () => {
      const plugin = new NewRelicPlugin(
        getServerless(
          {
            ...minimalConfig,
            alerts: Object.values(FunctionAlert)
          },
          {
            resources: {
              DynamoDB: {
                Type: 'AWS::DynamoDB::Table',
                Properties: {
                  Name: 'dynamo-table'
                }
              }
            }
          }
        )
      )
      const cf = plugin.getAlertsCloudFormation('AWS::DynamoDB::Table')
      expect(cf).toEqual({})
    })
  })

  describe('getGlobalAlerts', () => {
    it('should spread all alerts set', () => {
      const plugin = new NewRelicPlugin(getServerless(minimalConfig))
      const alerts = plugin.getGlobalAlerts([AlertsSet.DYNAMO_DB_SYSTEM_ERRORS])
      const alertSet = [
        DynamoDbAlert.BATCH_GET_SYSTEM_ERRORS,
        DynamoDbAlert.BATCH_WRITE_SYSTEM_ERRORS,
        DynamoDbAlert.DELETE_SYSTEM_ERRORS,
        DynamoDbAlert.GET_SYSTEM_ERRORS,
        DynamoDbAlert.PUT_SYSTEM_ERRORS,
        DynamoDbAlert.QUERY_SYSTEM_ERRORS,
        DynamoDbAlert.SCAN_SYSTEM_ERRORS,
        DynamoDbAlert.UPDATE_SYSTEM_ERRORS
      ]

      expect(alerts.map(alert => alert.type)).toEqual(alertSet)
      expect(alerts.length).toEqual(alertSet.length)
    })

    it('should filter out with warning all unknown alerts', () => {
      const plugin = new NewRelicPlugin(getServerless(minimalConfig))
      const alerts = plugin.getGlobalAlerts([FunctionAlert.THROTTLES, 'unknownAlert'])
      expect(alerts).toEqual([
        {
          enabled: true,
          resources: [],
          title: 'Function Throttles',
          type: FunctionAlert.THROTTLES,
          violationCloseTimer: 24
        }
      ])
    })
  })
})
