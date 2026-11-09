// UC22 draft state (client only: no DRAFT status is ever stored in the database - alternative flows 22.2 / 22.3).
export const initialDraft = { supplierId: null, note: '', items: [] }

export function draftReducer(state, action) {
  switch (action.type) {
    case 'setSupplier': // changing the supplier discards the items of the previous supplier
      return { ...state, supplierId: action.supplierId, items: [] }
    case 'setNote':
      return { ...state, note: action.value }
    case 'addItem': {
      const { variantId } = action.item
      if (state.items.some((i) => i.variantId === variantId)) return state // never add the same variant twice
      return { ...state, items: [...state.items, { quantity: '1', note: '', ...action.item }] }
    }
    case 'removeItem':
      return { ...state, items: state.items.filter((i) => i.variantId !== action.variantId) }
    case 'setQuantity':
      return { ...state, items: state.items.map((i) => (i.variantId === action.variantId ? { ...i, quantity: action.value } : i)) }
    case 'setItemNote':
      return { ...state, items: state.items.map((i) => (i.variantId === action.variantId ? { ...i, note: action.value } : i)) }
    case 'reset':
      return initialDraft
    default:
      return state
  }
}

/** The draft counts as changed once the user picked products or typed a note (choosing a supplier alone is not a change). */
export const isDirty = (draft) => draft.items.length > 0 || draft.note.trim() !== ''
