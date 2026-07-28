import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  answers,
  brands,
  collectionRuns,
  detections,
  freeAudits,
  queries,
  subscriptions,
} from '@/lib/db/schema'

describe('설계 ②의 핵심 필드', () => {
  it('collection_runs가 planSnapshot과 completeness를 가진다', () => {
    const cols = Object.keys(getTableColumns(collectionRuns))
    expect(cols).toContain('planSnapshot')
    expect(cols).toContain('completeness')
    expect(cols).toContain('metrics')
  })

  it('answers가 원본(raw)을 보관한다', () => {
    const cols = Object.keys(getTableColumns(answers))
    expect(cols).toContain('raw')
    expect(cols).toContain('citations')
    expect(cols).toContain('sampleIndex')
  })

  it('detections가 detectorVersion과 position을 가진다', () => {
    const cols = Object.keys(getTableColumns(detections))
    expect(cols).toContain('detectorVersion')
    expect(cols).toContain('position')
    expect(cols).toContain('sentiment')
    expect(cols).toContain('subject')
  })

  it('subscriptions가 queryPacks를 가진다', () => {
    expect(Object.keys(getTableColumns(subscriptions))).toContain('queryPacks')
  })

  it('brands가 별칭·경쟁사·질의쿼터를 가진다', () => {
    const cols = Object.keys(getTableColumns(brands))
    expect(cols).toContain('aliases')
    expect(cols).toContain('competitors')
    expect(cols).toContain('queryQuota')
    expect(cols).toContain('ambiguous')
    expect(cols).toContain('collectionWeekday')
  })

  it('queries가 source를 구분한다', () => {
    expect(Object.keys(getTableColumns(queries))).toContain('source')
  })

  it('free_audits가 A/B variant와 ipHash를 기록한다', () => {
    const cols = Object.keys(getTableColumns(freeAudits))
    expect(cols).toContain('variant')
    expect(cols).toContain('ipHash')
    expect(cols).toContain('email')
  })
})
