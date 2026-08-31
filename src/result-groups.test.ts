import { describe, expect, test } from 'bun:test'
import {
  groupPairTotals,
  groupPairsByCluster,
  groupPairsForDisplay,
  initialRevealKeys,
  nagpPairCount,
  nextRevealKey,
  planGroupReveals,
  remapRevealedKeys,
  sliceGroupsByRevealKeys,
  sortPairsForDisplay,
  visibleRevealPairCount,
  type GroupingNode,
  type GroupingPair,
} from './result-groups'

function node(overrides: Partial<GroupingNode> & Pick<GroupingNode, 'serialNumber'>): GroupingNode {
  return {
    hostName: null,
    nagp: null,
    customer: null,
    cluster: null,
    site: null,
    ...overrides,
  }
}

function pair(
  key: string,
  node1: GroupingNode,
  node2: GroupingNode | null = null,
): GroupingPair {
  return { key, node1, node2 }
}

describe('sortPairsForDisplay', () => {
  test('orders by NAGP, client, site, cluster, then node name', () => {
    const zebraNode = node({
      serialNumber: 's-z',
      hostName: 'zebra-01',
      nagp: { id: 'n1', name: 'Alpha NAGP' },
      customer: { id: 'c1', name: 'Acme' },
      site: { id: 'site-a', name: 'HQ', cmatId: null },
      cluster: { id: 'cl1', name: 'prod' },
    })
    const alphaNode = node({
      serialNumber: 's-a',
      hostName: 'alpha-01',
      nagp: { id: 'n1', name: 'Alpha NAGP' },
      customer: { id: 'c1', name: 'Acme' },
      site: { id: 'site-a', name: 'HQ', cmatId: null },
      cluster: { id: 'cl1', name: 'prod' },
    })
    const otherCluster = node({
      serialNumber: 's-b',
      hostName: 'beta-01',
      nagp: { id: 'n1', name: 'Alpha NAGP' },
      customer: { id: 'c1', name: 'Acme' },
      site: { id: 'site-a', name: 'HQ', cmatId: null },
      cluster: { id: 'cl2', name: 'dr' },
    })
    const otherSite = node({
      serialNumber: 's-s',
      hostName: 'site-node',
      nagp: { id: 'n1', name: 'Alpha NAGP' },
      customer: { id: 'c1', name: 'Acme' },
      site: { id: 'site-b', name: 'DR', cmatId: null },
      cluster: { id: 'cl5', name: 'aaa' },
    })
    const otherClient = node({
      serialNumber: 's-c',
      hostName: 'gamma-01',
      nagp: { id: 'n1', name: 'Alpha NAGP' },
      customer: { id: 'c2', name: 'Beta Co' },
      cluster: { id: 'cl3', name: 'edge' },
    })
    const otherNagp = node({
      serialNumber: 's-d',
      hostName: 'delta-01',
      nagp: { id: 'n2', name: 'Zulu NAGP' },
      customer: { id: 'c3', name: 'Acme' },
      cluster: { id: 'cl4', name: 'aaa' },
    })

    const sorted = sortPairsForDisplay([
      pair('z', zebraNode),
      pair('d', otherNagp),
      pair('c', otherClient),
      pair('s', otherSite),
      pair('b', otherCluster),
      pair('a', alphaNode),
    ])

    expect(sorted.map((item) => item.key)).toEqual(['s', 'b', 'a', 'z', 'c', 'd'])
  })

  test('orders clients with the same name by client ID', () => {
    const sorted = sortPairsForDisplay([
      pair(
        'c2',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          nagp: { id: 'n1', name: 'Parent' },
          customer: { id: 'c-b', name: 'Acme' },
          cluster: { id: 'cl', name: 'prod' },
        }),
      ),
      pair(
        'c1',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          nagp: { id: 'n1', name: 'Parent' },
          customer: { id: 'c-a', name: 'Acme' },
          cluster: { id: 'cl', name: 'prod' },
        }),
      ),
    ])

    expect(sorted.map((item) => item.key)).toEqual(['c1', 'c2'])
  })

  test('sorts missing NAGP and client IDs after named groups', () => {
    const known = pair(
      'known',
      node({
        serialNumber: 's1',
        hostName: 'n1',
        nagp: { id: 'n1', name: 'Known' },
        customer: { id: 'c1', name: 'Client' },
        cluster: { id: 'cl', name: 'clus' },
      }),
    )
    const unknown = pair(
      'unknown',
      node({
        serialNumber: 's2',
        hostName: 'aaa',
        cluster: { id: 'cl2', name: 'aaa' },
      }),
    )

    expect(sortPairsForDisplay([unknown, known]).map((item) => item.key)).toEqual([
      'known',
      'unknown',
    ])
  })
})

describe('groupPairsForDisplay', () => {
  test('nests NAGP then client then site then cluster', () => {
    const shared = {
      nagp: { id: 'n1', name: 'Parent' },
      customer: { id: 'c1', name: 'Client One' },
    }
    const groups = groupPairsForDisplay([
      pair(
        'p2',
        node({
          serialNumber: 's2',
          hostName: 'node-b',
          ...shared,
          cluster: { id: 'cl1', name: 'west' },
          site: { id: 'site-b', name: 'Site B', cmatId: null },
        }),
      ),
      pair(
        'p1',
        node({
          serialNumber: 's1',
          hostName: 'node-a',
          ...shared,
          cluster: { id: 'cl1', name: 'west' },
          site: { id: 'site-a', name: 'Site A', cmatId: null },
        }),
      ),
      pair(
        'p3',
        node({
          serialNumber: 's3',
          hostName: 'node-c',
          nagp: { id: 'n1', name: 'Parent' },
          customer: { id: 'c2', name: 'Client Two' },
          cluster: { id: 'cl2', name: 'east' },
        }),
      ),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.nagpId).toBe('n1')
    expect(groups[0]?.customers.map((customer) => customer.customerId)).toEqual(['c1', 'c2'])
    expect(groups[0]?.customers[0]?.sites.map((site) => site.siteId)).toEqual(['site-a', 'site-b'])
    expect(groups[0]?.customers[0]?.sites[0]?.clusters[0]?.pairs.map((item) => item.key)).toEqual([
      'p1',
    ])
    expect(nagpPairCount(groups[0]!)).toBe(3)
    expect(groupPairTotals(groups).nagp[groups[0]!.key]).toBe(3)
    expect(groupPairTotals(groups).site['id:n1::id:c1::id:site-a']).toBe(1)
  })

  test('merges the same customer ID even when names differ', () => {
    const groups = groupPairsForDisplay([
      pair(
        'a',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          nagp: { id: 'n1', name: 'Parent' },
          customer: { id: 'c1', name: 'Acme West' },
          cluster: { id: 'cl', name: 'prod' },
        }),
      ),
      pair(
        'b',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          nagp: { id: 'n1', name: 'Parent' },
          customer: { id: 'c1', name: 'Acme East' },
          cluster: { id: 'cl', name: 'prod' },
        }),
      ),
    ])

    expect(groups[0]?.customers).toHaveLength(1)
    expect(groups[0]?.customers[0]?.customerName).toBe('Acme East')
  })

  test('groups nameless-id NAGPs by name, and the same NAGP ID into one group', () => {
    const groups = groupPairsForDisplay([
      pair(
        'a',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          nagp: { id: null, name: 'Alpha' },
          cluster: { id: 'cl1', name: 'one' },
        }),
      ),
      pair(
        'b',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          nagp: { id: null, name: 'Beta' },
          cluster: { id: 'cl2', name: 'two' },
        }),
      ),
      pair(
        'c',
        node({
          serialNumber: 's3',
          hostName: 'n3',
          nagp: { id: 'shared', name: 'Other' },
          cluster: { id: 'cl3', name: 'three' },
        }),
      ),
      pair(
        'd',
        node({
          serialNumber: 's4',
          hostName: 'n4',
          nagp: { id: 'shared', name: 'Shared' },
          cluster: { id: 'cl4', name: 'four' },
        }),
      ),
    ])

    expect(groups.map((group) => group.nagpName)).toEqual(['Alpha', 'Beta', 'Other'])
    expect(groups[2]?.customers[0]?.sites[0]?.clusters).toHaveLength(2)
  })

  test('uses cluster and customer data from node2 when node1 is missing it', () => {
    const groups = groupPairsForDisplay([
      pair(
        'p',
        node({ serialNumber: 's1', hostName: 'n1' }),
        node({
          serialNumber: 's2',
          hostName: 'n2',
          nagp: { id: 'n1', name: 'Parent' },
          customer: { id: 'c1', name: 'Client' },
          cluster: { id: 'cl1', name: 'west' },
        }),
      ),
    ])

    expect(groups[0]?.nagpId).toBe('n1')
    expect(groups[0]?.customers[0]?.customerId).toBe('c1')
    expect(groups[0]?.customers[0]?.sites[0]?.clusters[0]?.clusterName).toBe('west')
  })

  test('treats blank cluster names as the same unknown cluster when IDs match', () => {
    const groups = groupPairsByCluster([
      pair(
        'a',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          cluster: { id: 'id-1', name: '  ' },
        }),
      ),
      pair(
        'b',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          cluster: { id: 'id-1', name: 'Prod' },
        }),
      ),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.clusterName).toBe('Prod')
  })

  test('keeps clusters with the same name but different IDs separate', () => {
    const groups = groupPairsByCluster([
      pair(
        'a',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          cluster: { id: 'id-2', name: 'shared' },
        }),
      ),
      pair(
        'b',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          cluster: { id: 'id-1', name: 'shared' },
        }),
      ),
    ])

    expect(groups.map((group) => group.clusterId)).toEqual(['id-1', 'id-2'])
  })

  test('groups by site ID, using cmatId when site.id is missing', () => {
    const groups = groupPairsForDisplay([
      pair(
        'a',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          customer: { id: 'c1', name: 'Client' },
          site: { id: null, name: null, cmatId: 'CMAT-1' },
        }),
      ),
      pair(
        'b',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          customer: { id: 'c1', name: 'Client' },
          site: null,
        }),
      ),
    ])

    expect(groups[0]?.customers[0]?.sites.map((site) => site.siteId)).toEqual(['CMAT-1', null])
  })

  test('prefers site.id over cmatId and keeps different site IDs separate', () => {
    const groups = groupPairsForDisplay([
      pair(
        'a',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          customer: { id: 'c1', name: 'Client' },
          site: { id: 'site-1', name: 'HQ', cmatId: 'CMAT-9' },
        }),
      ),
      pair(
        'b',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          customer: { id: 'c1', name: 'Client' },
          site: { id: 'site-1', name: 'Headquarters', cmatId: 'CMAT-8' },
        }),
      ),
      pair(
        'c',
        node({
          serialNumber: 's3',
          hostName: 'n3',
          customer: { id: 'c1', name: 'Client' },
          site: { id: 'site-2', name: 'HQ', cmatId: null },
        }),
      ),
    ])

    expect(groups[0]?.customers[0]?.sites.map((site) => site.siteId)).toEqual(['site-1', 'site-2'])
    expect(groups[0]?.customers[0]?.sites[0]?.clusters[0]?.pairs).toHaveLength(2)
  })

  test('groups name-only sites by normalized name and uses node2 site when node1 has none', () => {
    const groups = groupPairsForDisplay([
      pair(
        'a',
        node({
          serialNumber: 's1',
          hostName: 'n1',
          customer: { id: 'c1', name: 'Client' },
          site: { id: null, name: 'HQ', cmatId: null },
        }),
      ),
      pair(
        'b',
        node({
          serialNumber: 's2',
          hostName: 'n2',
          customer: { id: 'c1', name: 'Client' },
          site: { id: null, name: 'hq', cmatId: null },
        }),
      ),
      pair(
        'c',
        node({ serialNumber: 's3', hostName: 'n3', customer: { id: 'c1', name: 'Client' } }),
        node({
          serialNumber: 's4',
          hostName: 'n4',
          customer: { id: 'c1', name: 'Client' },
          site: { id: 'from-node2', name: 'Remote', cmatId: null },
        }),
      ),
    ])

    expect(groups[0]?.customers[0]?.sites.map((site) => site.siteId ?? site.siteName)).toEqual([
      'HQ',
      'from-node2',
    ])
  })
})

describe('progressive group reveal', () => {
  function revealPair(
    key: string,
    customerId: string,
    siteId: string,
    clusterId: string,
  ) {
    return pair(
      key,
      node({
        serialNumber: key,
        hostName: `${key}-node`,
        nagp: { id: 'n1', name: 'Parent' },
        customer: { id: customerId, name: `Client ${customerId}` },
        site: { id: siteId, name: `Site ${siteId}`, cmatId: null },
        cluster: { id: clusterId, name: `Cluster ${clusterId}` },
      }),
    )
  }

  test('reveals small customers as complete units', () => {
    const groups = groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's1', 'cl1'),
      revealPair('c', 'c2', 's2', 'cl2'),
    ])
    const units = planGroupReveals(groups, 2)

    expect(units.map((unit) => [unit.kind, unit.pairCount])).toEqual([
      ['customer', 2],
      ['customer', 1],
    ])
    const initialKeys = initialRevealKeys(units, 2)
    expect([...initialKeys]).toEqual([units[0]!.key])
    expect(visibleRevealPairCount(units, initialKeys)).toBe(2)
    expect(sliceGroupsByRevealKeys(groups, units, initialKeys)[0]?.customers).toHaveLength(1)
  })

  test('splits a large customer into sites without splitting clusters', () => {
    const groups = groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's1', 'cl1'),
      revealPair('c', 'c1', 's2', 'cl2'),
    ])
    const units = planGroupReveals(groups, 2)

    expect(units.map((unit) => unit.kind)).toEqual(['site', 'site'])
    const firstSlice = sliceGroupsByRevealKeys(groups, units, new Set([units[0]!.key]))
    expect(firstSlice[0]?.customers[0]?.sites).toHaveLength(1)
    expect(firstSlice[0]?.customers[0]?.sites[0]?.clusters[0]?.pairs).toHaveLength(2)
  })

  test('uses whole clusters when a site exceeds the budget', () => {
    const groups = groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's1', 'cl1'),
      revealPair('c', 'c1', 's1', 'cl2'),
    ])
    const units = planGroupReveals(groups, 1)

    expect(units.map((unit) => [unit.kind, unit.pairCount])).toEqual([
      ['cluster', 2],
      ['cluster', 1],
    ])
    const firstSlice = sliceGroupsByRevealKeys(groups, units, new Set([units[0]!.key]))
    expect(firstSlice[0]?.customers[0]?.sites[0]?.clusters).toHaveLength(1)
    expect(firstSlice[0]?.customers[0]?.sites[0]?.clusters[0]?.pairs).toHaveLength(2)
  })

  test('includes a complete oversized first unit and overshoots with complete units', () => {
    const groups = groupPairsForDisplay([
      ...Array.from({ length: 15 }, (_, index) =>
        revealPair(`a${index}`, 'c1', 's1', 'cl1')),
      ...Array.from({ length: 15 }, (_, index) =>
        revealPair(`b${index}`, 'c1', 's1', 'cl2')),
    ])
    const units = planGroupReveals(groups, 20)

    expect([...initialRevealKeys(units, 20)]).toEqual(units.map((unit) => unit.key))
    expect(visibleRevealPairCount(units, initialRevealKeys(units, 20))).toBe(30)
  })

  test('advances past hidden descendants to the next visible unit', () => {
    const groups = groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's1', 'cl2'),
      revealPair('c', 'c2', 's2', 'cl3'),
    ])
    const units = planGroupReveals(groups, 1)
    const collapsed = new Set([units[0]!.customerKey])

    const revealed = new Set([units[0]!.key])
    expect(nextRevealKey(units, revealed, collapsed)).toBe(units[2]!.key)
    revealed.add(units[2]!.key)
    expect(sliceGroupsByRevealKeys(groups, units, revealed)).toHaveLength(1)
    expect(sliceGroupsByRevealKeys(groups, units, revealed)[0]?.customers).toHaveLength(2)
    expect(sliceGroupsByRevealKeys(groups, units, revealed)[0]?.customers[0]?.sites[0]?.clusters)
      .toHaveLength(1)
  })

  test('skips a collapsed site and reports no next key when everything is collapsed', () => {
    const groups = groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's1', 'cl2'),
      revealPair('c', 'c2', 's2', 'cl3'),
    ])
    const units = planGroupReveals(groups, 1)
    const revealed = new Set([units[0]!.key])

    expect(nextRevealKey(units, revealed, new Set([units[0]!.siteKey!])))
      .toBe(units[2]!.key)
    expect(nextRevealKey(units, revealed, new Set([
      units[0]!.customerKey,
      units[2]!.customerKey,
    ]))).toBeNull()
  })

  test('remaps a revealed customer to sites and a revealed site to clusters', () => {
    const smallGroups = groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
    ])
    const customerUnits = planGroupReveals(smallGroups, 2)
    const siteUnits = planGroupReveals(groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's2', 'cl2'),
      revealPair('c', 'c1', 's3', 'cl3'),
    ]), 2)
    const remappedSites = remapRevealedKeys(
      customerUnits,
      siteUnits,
      new Set([customerUnits[0]!.key]),
    )
    expect(remappedSites).toEqual(new Set(siteUnits.map((unit) => unit.key)))

    const clusterUnits = planGroupReveals(groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's1', 'cl2'),
      revealPair('c', 'c1', 's1', 'cl3'),
    ]), 1)
    const oneSiteUnit = planGroupReveals(groupPairsForDisplay([
      revealPair('a', 'c1', 's1', 'cl1'),
      revealPair('b', 'c1', 's1', 'cl2'),
      revealPair('c', 'c1', 's1', 'cl3'),
    ]), 3)
    expect(remapRevealedKeys(
      oneSiteUnit,
      clusterUnits,
      new Set([oneSiteUnit[0]!.key]),
    )).toEqual(new Set(clusterUnits.map((unit) => unit.key)))
  })

  test('handles empty and completed plans without advancing', () => {
    expect(initialRevealKeys([])).toEqual(new Set())
    expect(nextRevealKey([], new Set(), new Set())).toBeNull()
    expect(sliceGroupsByRevealKeys([], [], new Set())).toEqual([])
  })
})
