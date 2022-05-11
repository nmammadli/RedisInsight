import { keyBy, mapValues } from 'lodash'
import React, { FormEvent, useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import {
  EuiButton,
  EuiTextColor,
  EuiForm,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
} from '@elastic/eui'
import { addStreamKey } from 'uiSrc/slices/browser/keys'
import { entryIdRegex, isRequiredStringsValid, Maybe } from 'uiSrc/utils'
import { StreamEntryFields } from 'uiSrc/pages/browser/components/key-details-add-items'
import { AddStreamFormConfig as config } from 'uiSrc/pages/browser/components/add-key/constants/fields-config'
import { CreateStreamDto } from 'apiSrc/modules/browser/dto/stream.dto'
import AddKeyFooter from '../AddKeyFooter/AddKeyFooter'

import styles from './styles.module.scss'

export interface Props {
  keyName: string
  keyTTL: Maybe<number>
  onCancel: (isCancelled?: boolean) => void
}

export const INITIAL_STREAM_FIELD_STATE = {
  fieldName: '',
  fieldValue: '',
  id: 0,
}

const AddKeyStream = (props: Props) => {
  const { keyName = '', keyTTL, onCancel } = props

  const [entryIdError, setEntryIdError] = useState('')
  const [entryID, setEntryID] = useState<string>('*')
  const [fields, setFields] = useState<any[]>([{ ...INITIAL_STREAM_FIELD_STATE }])
  const [isFormValid, setIsFormValid] = useState<boolean>(false)

  const dispatch = useDispatch()

  useEffect(() => {
    const isValid = isRequiredStringsValid(keyName)
      && !entryIdError
      && fields.every((f) => isRequiredStringsValid(f.fieldName, f.fieldValue))
    setIsFormValid(isValid)
  }, [keyName, fields, entryIdError])

  useEffect(() => {
    validateEntryID()
  }, [entryID])

  const validateEntryID = () => {
    setEntryIdError(entryIdRegex.test(entryID) ? '' : `${config.entryId.name} format is incorrect`)
  }

  const onFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (isFormValid) {
      submitData()
    }
  }

  const submitData = (): void => {
    const data: CreateStreamDto = {
      keyName,
      entries: [{
        id: entryID,
        fields: mapValues(keyBy(fields, 'fieldName'), 'fieldValue')
      }]
    }
    if (keyTTL !== undefined) {
      data.expire = keyTTL
    }
    dispatch(addStreamKey(data, onCancel))
  }

  return (
    <EuiForm className={styles.container} component="form" onSubmit={onFormSubmit}>
      <StreamEntryFields
        entryID={entryID}
        entryIdError={entryIdError}
        fields={fields}
        setFields={setFields}
        setEntryID={setEntryID}
      />
      <EuiButton type="submit" fill style={{ display: 'none' }}>
        Submit
      </EuiButton>
      <AddKeyFooter>
        <EuiPanel
          color="transparent"
          className="flexItemNoFullWidth"
          hasShadow={false}
          borderRadius="none"
          style={{ border: 'none' }}
        >
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <div>
                <EuiButton
                  color="secondary"
                  onClick={() => onCancel(true)}
                  className="btn-cancel btn-back"
                >
                  <EuiTextColor>Cancel</EuiTextColor>
                </EuiButton>
              </div>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <div>
                <EuiButton
                  fill
                  size="m"
                  color="secondary"
                  className="btn-add"
                  onClick={submitData}
                  disabled={!isFormValid}
                  data-testid="add-key-hash-btn"
                >
                  Add Key
                </EuiButton>
              </div>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </AddKeyFooter>
    </EuiForm>
  )
}

export default AddKeyStream
