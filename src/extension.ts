import { commands, ExtensionContext, window } from "vscode"
import executeSteps from "./steps"

export function activate(context: ExtensionContext) {
  let disposable = commands.registerCommand("pizza.orderPizza", async () => {
    const state = await executeSteps()
    if (state?.helper?.order == null) return
    try {
      await state.helper.order.validate()
      await state.helper.order.place()
      window.showInformationMessage("Order Placed!")
    } catch (e) {
      console.log(e)
      console.log(state.helper.order)
      window.showErrorMessage(e.message)
    }
  })

  context.subscriptions.push(disposable)
}

export function deactivate() {}
