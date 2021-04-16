import { workspace, QuickPickItem } from "vscode"
import {
  State,
  MultiStepInput,
  Customer,
  InputStep,
  DeepPartial,
  collectInputs,
} from "./MultiStepInput"
import dominos from "dominos"
import { InputFlowAction } from "./MultiStepInput"

export default function executeSteps(): Promise<State> {
  const customer: Partial<Customer> = {}
  const config = workspace.getConfiguration("pizza")
  const steps: [InputStep?] = []
  const address = config.get("address") as string
  if (address) {
    customer.address = address
  } else {
    steps.push(getAddress)
  }
  steps.push(getProduct)
  steps.push(getVariant)
  const firstName = config.get("firstName") as string
  if (firstName) {
    customer.firstName = firstName
  } else {
    steps.push(getFirstName)
  }
  const lastName = config.get("lastName") as string
  if (lastName) {
    customer.lastName = lastName
  } else {
    steps.push(getLastName)
  }
  const email = config.get("email") as string
  if (email) {
    customer.email = email
  } else {
    steps.push(getEmail)
  }
  const phoneNumber = config.get("phoneNumber") as string
  if (phoneNumber) {
    customer.phone = phoneNumber
  } else {
    steps.push(getPhoneNumber)
  }

  steps.push(approve)
  const state: DeepPartial<State> = { customer: customer, creditCard: {} }
  return collectInputs(steps as [InputStep], state)
}

async function getAddress(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  const answer = await input.showInputBox(
    "Enter Your Address with proper commas. EX: Street, City, State, Zip"
  )
  if (answer === "") throw InputFlowAction.resume("Cannot be blank")
  return { ...state, customer: { ...state.customer, address: answer } }
}

async function getFirstName(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  const answer = await input.showInputBox("Enter Your First Name")
  if (answer === "") throw InputFlowAction.resume("Cannot be blank")
  return { ...state, customer: { ...state.customer, firstName: answer } }
}

async function getLastName(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  const answer = await input.showInputBox("Enter Your Last Name")
  if (answer === "") throw InputFlowAction.resume("Cannot be blank")
  return { ...state, customer: { ...state.customer, lastName: answer } }
}

async function getEmail(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  const answer = await input.showInputBox("Enter Your Email")
  if (answer === "") throw InputFlowAction.resume("Cannot be blank")
  return { ...state, customer: { ...state.customer, email: answer } }
}

async function getPhoneNumber(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  const answer = await input.showInputBox("Enter Your Phone Number")
  if (answer === "") throw InputFlowAction.resume("Cannot be blank")
  return { ...state, customer: { ...state.customer, phone: answer } }
}

async function approve(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  const order = new dominos.Order(new dominos.Customer(state.customer))
  order.addItem(new dominos.Item({ code: state.itemCode }))
  order.storeID = state.storeId
  await order.price()
  const price = order.amountsBreakdown.customer

  await input.showInputBox(
    `Your order will cost $${price} and take around ${order.estimatedWaitMinutes} minutes. You must pay in cash when it arrives.`
  )
  //   Amount: 19.62
  // CardType: ""
  // Expiration: ""
  // Number: ""
  // OTP: ""
  // PaymentMethodID: ""
  // PostalCode: ""
  // ProviderID: ""
  // SecurityCode: ""
  // Type: "Cash"
  // gpmPaymentType: ""
  order.payments.push(new CashPayment(price))
  return { ...state, helper: { ...state.helper, order } }
}

class CashPayment {
  Type: string
  Amount: number
  constructor(amount: number) {
    this.Amount = amount
    this.Type = "Cash"
    // this.CardType = ""
    // this.Expiration = ""
    // this.Number = ""
    // this.OTP = ""
    // this.PaymentMethodID = ""
    // this.PostalCode = ""
    // this.ProviderID = ""
    // this.SecurityCode = ""
    // this.gpmPaymentType = ""
  }

  get formatted() {
    return JSON.parse(JSON.stringify(this))
  }
}

interface ProductQPItem extends QuickPickItem {
  product: any
}

async function getProduct(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  const store = await getNearbyStore(state.customer?.address)
  if (store.StoreID == null) throw InputFlowAction.back("No nearby open stores")
  const menu = await new dominos.Menu(store.StoreID)
  const products = menu.menu.categories.food.pizza.subCategories.specialty.products
    .map((code: string) => {
      const product = menu.menu.products[code]
      if (product == null) return
      return {
        label: `${product.name} ${product.productType}`,
        product,
      }
    })
    .filter((p: any) => p != null)

  const { product } = await input.showQuickPick<ProductQPItem>(products)
  return {
    ...state,
    storeId: store.StoreID,
    helper: { ...state.helper, product, menu },
  }
}

interface VariantQPItem extends QuickPickItem {
  variant: any
}

async function getVariant(
  input: MultiStepInput,
  state: DeepPartial<State>
): Promise<DeepPartial<State>> {
  if (state?.helper?.product == null)
    throw InputFlowAction.back("Pick a product")
  const variants = (state as State).helper.product.variants
    .map((variantCode: string) => {
      const variant = (state as State).helper.menu.menu.variants[variantCode]
      if (variant == null) return
      return {
        label: variant.name.replace((state as State).helper.product.name, ""),
        description: variant.price,
        variant,
      }
    })
    .filter((v: any) => v != null)
    .sort(
      ({ variant: a }: any, { variant: b }: any) =>
        parseInt(a.sizeCode) - parseInt(b.sizeCode)
    )

  const { variant } = await input.showQuickPick<VariantQPItem>(variants)
  return { ...state, itemCode: variant.code }
}

async function getNearbyStore(address: string | void) {
  const nearbyStores = await new dominos.NearbyStores(address)
  return nearbyStores.stores.reduce(
    (closestStore: any, store: any) => {
      if (
        store.IsOnlineCapable &&
        store.IsDeliveryStore &&
        store.IsOpen &&
        store.ServiceIsOpen.Delivery &&
        store.MinDistance < closestStore.MinDistance
      ) {
        return store
      }
      return closestStore
    },
    { MinDistance: Number.POSITIVE_INFINITY }
  )
}
