import {
  QuickPickItem,
  window,
  Disposable,
  QuickInput,
  QuickInputButtons,
} from "vscode"

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>
}

export interface Customer {
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
}

interface CreditCard {
  number: string
  expiration: string
  securityCode: string
  postalCode: string
}

export interface State {
  customer: Customer
  creditCard: CreditCard
  helper: {
    menu: any
    product: any
    order: any
  }
  tip: number
  storeId: number
  itemCode: string
}

export async function collectInputs(
  steps: [InputStep],
  startingState: DeepPartial<State> = {}
): Promise<State> {
  const input = new MultiStepInput(steps.length, "Order Pizza")
  return (await input.stepThrough(steps, startingState)) as State
}

export class InputFlowAction {
  message: string | void
  type: string

  constructor(type: string, message: string | void) {
    this.type = type
    this.message = message
  }

  static back(message: string | void) {
    return new InputFlowAction("back", message)
  }

  static cancel(message: string | void) {
    return new InputFlowAction("cancel", message)
  }

  static resume(message: string | void) {
    return new InputFlowAction("resume", message)
  }
}

export type InputStep = (
  input: MultiStepInput,
  state: DeepPartial<State>
) => Thenable<DeepPartial<State>>

export class MultiStepInput {
  public totalSteps: number
  public title: string

  constructor(totalSteps: number, title: string) {
    this.totalSteps = totalSteps
    this.title = title
  }

  private current?: QuickInput
  private currentStepNumber: number = 1
  private steps: InputStep[] = []

  async stepThrough(steps: [InputStep], state: DeepPartial<State>) {
    for (
      this.currentStepNumber = 1;
      this.currentStepNumber <= steps.length;
      this.currentStepNumber++
    ) {
      if (this.currentStepNumber <= 0) break
      const step = steps[this.currentStepNumber - 1]
      if (this.current) {
        this.current.enabled = false
        this.current.busy = true
      }
      try {
        state = await step(this, state)
      } catch (e) {
        if (e instanceof InputFlowAction) {
          if (e.message) window.showErrorMessage(e.message)

          switch (e.type) {
            case "back":
              this.currentStepNumber -= 2
              break
            case "resume":
              this.currentStepNumber--
              break
            case "cancel":
              this.currentStepNumber = Number.POSITIVE_INFINITY
              break
          }
        } else {
          console.error(e)
          throw e
        }
      }
    }
    if (this.current) {
      this.current.dispose()
    }
    return state
  }

  async showQuickPick<T extends QuickPickItem>(items: [T]) {
    const disposables: Disposable[] = []
    try {
      return await new Promise<T>((resolve, reject) => {
        const input = window.createQuickPick<T>()
        input.title = this.title
        input.step = this.currentStepNumber
        input.totalSteps = this.totalSteps
        input.items = items
        ;(input.buttons =
          this.steps.length > 1 ? [QuickInputButtons.Back] : []),
          disposables.push(
            input.onDidTriggerButton(item => {
              if (item === QuickInputButtons.Back) {
                reject(InputFlowAction.back())
              } else {
                resolve(<any>item)
              }
            }),
            input.onDidChangeSelection(items => resolve(items[0])),
            input.onDidHide(() => {
              reject(InputFlowAction.cancel())
            })
          )
        if (this.current) {
          this.current.dispose()
        }
        this.current = input
        this.current.show()
      })
    } finally {
      disposables.forEach(d => d.dispose())
    }
  }

  async showInputBox(prompt: string) {
    const disposables: Disposable[] = []
    try {
      return await new Promise<string>((resolve, reject) => {
        const input = window.createInputBox()
        input.title = this.title
        input.step = this.currentStepNumber
        input.totalSteps = this.totalSteps
        input.prompt = prompt
        input.buttons =
          this.currentStepNumber > 1 ? [QuickInputButtons.Back] : []
        disposables.push(
          input.onDidTriggerButton(item => {
            if (item === QuickInputButtons.Back) {
              reject(InputFlowAction.back())
            } else {
              resolve(<any>item)
            }
          }),
          input.onDidAccept(async () => {
            resolve(input.value)
          }),
          input.onDidHide(() => {
            reject(InputFlowAction.cancel())
          })
        )
        if (this.current) {
          this.current.dispose()
        }
        this.current = input
        this.current.show()
      })
    } finally {
      disposables.forEach(d => d.dispose())
    }
  }
}
