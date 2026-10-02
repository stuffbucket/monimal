import specimen0 from './font-specimens/intel-one-mono.svg'
import typeRamp0 from './font-specimens/intel-one-mono-type-ramp.svg'
import weightRamp0 from './font-specimens/intel-one-mono-weight-ramp.svg'
import specimen1 from './font-specimens/atkinson-hyperlegible-mono.svg'
import typeRamp1 from './font-specimens/atkinson-hyperlegible-mono-type-ramp.svg'
import weightRamp1 from './font-specimens/atkinson-hyperlegible-mono-weight-ramp.svg'
import specimen2 from './font-specimens/0xproto.svg'
import typeRamp2 from './font-specimens/0xproto-type-ramp.svg'
import weightRamp2 from './font-specimens/0xproto-weight-ramp.svg'
import specimen3 from './font-specimens/fira-code.svg'
import typeRamp3 from './font-specimens/fira-code-type-ramp.svg'
import weightRamp3 from './font-specimens/fira-code-weight-ramp.svg'
import specimen4 from './font-specimens/hack.svg'
import typeRamp4 from './font-specimens/hack-type-ramp.svg'
import weightRamp4 from './font-specimens/hack-weight-ramp.svg'
import specimen5 from './font-specimens/jetbrains-mono.svg'
import typeRamp5 from './font-specimens/jetbrains-mono-type-ramp.svg'
import weightRamp5 from './font-specimens/jetbrains-mono-weight-ramp.svg'

interface FontSpecimen {
  name: string
  typeRamp: string
  weightRamp: string
}

export const FONT_SPECIMENS: Readonly<Record<string, FontSpecimen>> = {
  'intel-one-mono': { name: specimen0, typeRamp: typeRamp0, weightRamp: weightRamp0 },
  'atkinson-hyperlegible-mono': { name: specimen1, typeRamp: typeRamp1, weightRamp: weightRamp1 },
  '0xproto': { name: specimen2, typeRamp: typeRamp2, weightRamp: weightRamp2 },
  'fira-code': { name: specimen3, typeRamp: typeRamp3, weightRamp: weightRamp3 },
  'hack': { name: specimen4, typeRamp: typeRamp4, weightRamp: weightRamp4 },
  'jetbrains-mono': { name: specimen5, typeRamp: typeRamp5, weightRamp: weightRamp5 },
}
