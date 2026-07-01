import { invoke } from '@/core/utils/ipc'
import type { Workflow, WorkflowDefinition } from '@/core/types'

export const workflowService = {
  getWorkflows() {
    return invoke<{ workflows: Workflow[] }>('workflow:list')
  },
  getWorkflow(id: number) {
    return invoke<{ workflow: Workflow }>('workflow:get', { id })
  },
  createWorkflow(data: {
    name: string
    description?: string
    definition: WorkflowDefinition
    isDefault?: boolean
  }) {
    return invoke<{ success: boolean; id: number }>('workflow:create', data)
  },
  updateWorkflow(
    id: number,
    data: Partial<{
      name: string
      description: string
      definition: WorkflowDefinition
      isDefault: boolean
      enabled: boolean
    }>
  ) {
    return invoke<{ success: boolean }>('workflow:update', { id, ...data })
  },
  deleteWorkflow(id: number) {
    return invoke<{ success: boolean }>('workflow:delete', { id })
  },
  setDefault(id: number) {
    return invoke<{ success: boolean }>('workflow:setDefault', { id })
  }
}
