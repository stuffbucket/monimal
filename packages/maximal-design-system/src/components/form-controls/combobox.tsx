import {
  Combobox as BaseCombobox,
  type ComboboxRootChangeEventDetails,
} from '@base-ui/react/combobox'
import type { ComponentPropsWithRef, ReactNode, RefObject } from 'react'
import { useId, useMemo, useState } from 'react'

import type { DataAttributes } from '../element-attributes'
import { Menu, MenuItemContent } from '../overlays/menu'

export interface ComboboxOption<Value extends string = string> {
  value: Value
  label: ReactNode
  textValue: string
  description?: ReactNode
  metadata?: ReactNode
  icon?: ReactNode
  keywords?: readonly string[]
  disabled?: boolean
}

export interface ComboboxGroup<Value extends string = string> {
  label: ReactNode
  options: readonly ComboboxOption<Value>[]
}

interface ComboboxSharedProps<Value extends string> {
  label: ReactNode
  value?: Value | null
  defaultValue?: Value | null
  onValueChange?: (
    value: Value | null,
    eventDetails: ComboboxRootChangeEventDetails,
  ) => void
  inputValue?: string
  defaultInputValue?: string
  onInputValueChange?: (
    value: string,
    eventDetails: ComboboxRootChangeEventDetails,
  ) => void
  placeholder?: string
  description?: ReactNode
  error?: ReactNode
  loading?: boolean
  loadingMessage?: ReactNode
  emptyMessage?: ReactNode
  disabled?: boolean
  inline?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  leading?: ReactNode
  showLabel?: boolean
  className?: string
  container?:
    | HTMLElement
    | ShadowRoot
    | RefObject<HTMLElement | ShadowRoot | null>
    | null
  inputProps?: ComponentPropsWithRef<typeof BaseCombobox.Input> & DataAttributes
  popupProps?: Omit<
    ComponentPropsWithRef<typeof BaseCombobox.Popup>,
    'children'
  > & DataAttributes
}

interface FlatComboboxProps<Value extends string> {
  options: readonly ComboboxOption<Value>[]
  groups?: never
}

interface GroupedComboboxProps<Value extends string> {
  options?: never
  groups: readonly ComboboxGroup<Value>[]
}

export type ComboboxProps<Value extends string = string> =
  ComboboxSharedProps<Value> & (
    | FlatComboboxProps<Value>
    | GroupedComboboxProps<Value>
  )

interface SourceGroup<Value extends string> {
  label?: ReactNode
  items: readonly ComboboxOption<Value>[]
}

function optionMatches<Value extends string>(
  option: ComboboxOption<Value>,
  query: string,
): boolean {
  const normalized = query.toLocaleLowerCase()
  return option.textValue.toLocaleLowerCase().includes(normalized)
    || option.keywords?.some((keyword) =>
      keyword.toLocaleLowerCase().includes(normalized)) === true
}

function ComboboxList<Value extends string>({
  groups,
  emptyMessage,
  loading,
  loadingMessage,
}: {
  groups: readonly SourceGroup<Value>[]
  emptyMessage: ReactNode
  loading: boolean
  loadingMessage: ReactNode
}) {
  const emptyContent = loading
    ? loadingMessage
    : emptyMessage
  return (
    <>
      <BaseCombobox.Status className="maximal-visually-hidden">
        {loading ? loadingMessage : null}
      </BaseCombobox.Status>
      <BaseCombobox.Empty className="maximal-visually-hidden">
        {emptyContent}
      </BaseCombobox.Empty>
      <BaseCombobox.List className="maximal-combobox__list">
        {groups.map((group, groupIndex) => (
          <BaseCombobox.Group
            className="maximal-menu__group"
            items={group.items.map((option) => option.value)}
            key={groupIndex}
          >
            {group.label === undefined ? null : (
              <BaseCombobox.GroupLabel className="maximal-secondary-copy maximal-menu__heading">
                {group.label}
              </BaseCombobox.GroupLabel>
            )}
            {group.items.map((option) => (
              <BaseCombobox.Item
                className="maximal-option maximal-combobox__option"
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                <MenuItemContent
                  description={option.description}
                  leading={option.icon}
                  trailing={option.metadata}
                >
                  {option.label}
                </MenuItemContent>
              </BaseCombobox.Item>
            ))}
          </BaseCombobox.Group>
        ))}
        {groups.length === 0 ? (
          <div
            aria-disabled="true"
            aria-selected="false"
            className="maximal-menu__state maximal-option maximal-option--empty"
            role="option"
          >
            {emptyContent}
          </div>
        ) : null}
      </BaseCombobox.List>
    </>
  )
}

export function Combobox<Value extends string>({
  label,
  options,
  groups,
  value,
  defaultValue,
  onValueChange,
  inputValue,
  defaultInputValue,
  onInputValueChange,
  placeholder,
  description,
  error,
  loading = false,
  loadingMessage = 'Loading options...',
  emptyMessage = 'No options found.',
  disabled,
  inline = false,
  open,
  defaultOpen,
  onOpenChange,
  leading,
  showLabel = true,
  className,
  container,
  inputProps,
  popupProps,
}: ComboboxProps<Value>) {
  const labelId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const sourceGroups = useMemo<readonly SourceGroup<Value>[]>(() => (
    groups?.map((group) => ({ label: group.label, items: group.options }))
    ?? [{ items: options ?? [] }]
  ), [groups, options])
  const selectedTextValue = useMemo(() => {
    const selectedValue = value ?? defaultValue
    return sourceGroups
      .flatMap((group) => group.items)
      .find((option) => option.value === selectedValue)?.textValue ?? ''
  }, [defaultValue, sourceGroups, value])
  const [uncontrolledInput, setUncontrolledInput] = useState(() => ({
    selectedValue: value,
    text: defaultInputValue ?? selectedTextValue,
  }))
  const query = inputValue ?? (
    value !== undefined && value !== uncontrolledInput.selectedValue
      ? selectedTextValue
      : uncontrolledInput.text
  )
  const filteredGroups = useMemo(() => sourceGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((option) => optionMatches(option, query)),
    }))
    .filter((group) => group.items.length > 0), [query, sourceGroups])
  const itemGroups = useMemo(() => sourceGroups.map((group) => ({
    items: group.items.map((option) => option.value),
  })), [sourceGroups])
  const filteredItemGroups = useMemo(() => filteredGroups.map((group) => ({
    items: group.items.map((option) => option.value),
  })), [filteredGroups])
  const list = error === undefined ? (
    <ComboboxList
      emptyMessage={emptyMessage}
      groups={filteredGroups}
      loading={loading}
      loadingMessage={loadingMessage}
    />
  ) : null
  const renderedInline = inline && list !== null
  const inputControl = (
    <BaseCombobox.InputGroup className="maximal-combobox__input-group">
      {leading === undefined ? null : (
        <span className="maximal-combobox__adornment">{leading}</span>
      )}
      <BaseCombobox.Input
        {...inputProps}
        aria-describedby={[
          description === undefined ? undefined : descriptionId,
          error === undefined ? undefined : errorId,
          inputProps?.['aria-describedby'],
        ].filter(Boolean).join(' ') || undefined}
        aria-invalid={error === undefined ? inputProps?.['aria-invalid'] : true}
        aria-labelledby={labelId}
        className={[
          'maximal-combobox__input',
          inputProps?.className,
        ].filter(Boolean).join(' ')}
        placeholder={placeholder ?? inputProps?.placeholder}
        {...(inputValue === undefined ? {} : { value: inputValue })}
      />
    </BaseCombobox.InputGroup>
  )
  const supportingText = (
    <>
      {description === undefined ? null : (
        <p className="maximal-field-description" id={descriptionId}>
          {description}
        </p>
      )}
      {error === undefined ? null : (
        <p className="maximal-field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </>
  )

  return (
    <div className={['maximal-combobox', className].filter(Boolean).join(' ')}>
      <label
        className={[
          'maximal-field-label',
          !showLabel && 'maximal-visually-hidden',
        ].filter(Boolean).join(' ')}
        id={labelId}
      >
        {label}
      </label>
      <BaseCombobox.Root<Value, false, Value>
        defaultOpen={renderedInline ? undefined : defaultOpen}
        defaultValue={defaultValue}
        disabled={disabled}
        filteredItems={filteredItemGroups}
        filter={null}
        inline={renderedInline}
        inputValue={query}
        itemToStringLabel={(itemValue) =>
          sourceGroups
            .flatMap((group) => group.items)
            .find((option) => option.value === itemValue)?.textValue ?? itemValue
        }
        items={itemGroups}
        onInputValueChange={(nextInputValue, eventDetails) => {
          if (inputValue === undefined) {
            setUncontrolledInput({
              selectedValue: value,
              text: nextInputValue,
            })
          }
          onInputValueChange?.(nextInputValue, eventDetails)
        }}
        onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
        onValueChange={(nextValue, eventDetails) =>
          onValueChange?.(nextValue, eventDetails)}
        open={inline ? renderedInline : open}
        value={value}
      >
        {inline ? (
          <Menu variant="search">
            {inputControl}
            {supportingText}
            {list}
          </Menu>
        ) : (
          <>
            {inputControl}
            {supportingText}
            {list === null ? null : (
              <BaseCombobox.Portal container={container}>
                <BaseCombobox.Positioner
                  align="start"
                  className="maximal-popup-positioner"
                  sideOffset={4}
                >
                  <BaseCombobox.Popup
                    {...popupProps}
                    className={[
                      'maximal-popup maximal-menu maximal-combobox__popup',
                      popupProps?.className,
                    ].filter(Boolean).join(' ')}
                  >
                    {list}
                  </BaseCombobox.Popup>
                </BaseCombobox.Positioner>
              </BaseCombobox.Portal>
            )}
          </>
        )}
      </BaseCombobox.Root>
    </div>
  )
}
