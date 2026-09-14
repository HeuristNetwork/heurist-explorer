import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordTypeProvider } from '../../src/data/RecordTypeProvider.js';
import { MapDocumentListProvider } from '../../src/data/MapDocumentListProvider.js';

test('resolves MapDocument record type and lists all documents', async () => {
  const calls=[];
  const apiClient={
    async get(path,{query}={}){
      calls.push({path,query});
      if(path.startsWith('/rty/')) return {rty_ID:'24'};
      return {records:[{rec_ID:'126',rec_RecTypeID:'24',rec_Title:'Brantford'},{rec_ID:'129',rec_RecTypeID:'24',rec_Title:'China'}],pagination:{total:2}};
    }
  };
  const recordTypes=new RecordTypeProvider({apiClient});
  const provider=new MapDocumentListProvider({apiClient,recordTypes});
  const result=await provider.search();
  assert.deepEqual(result.items.map(item=>item.id),[126,129]);
  assert.deepEqual(JSON.parse(calls[1].query.q),{t:24});
  assert.equal(calls[1].query.fields,'rec_Title');
});

test('MapDocument list accepts ID arrays and standard Heurist queries', async () => {
  const queries=[];
  const apiClient={async get(path,{query}={}){if(path.startsWith('/rty/'))return {rty_ID:24};queries.push(query);return {records:[]};}};
  const provider=new MapDocumentListProvider({apiClient,recordTypes:new RecordTypeProvider({apiClient})});
  await provider.search([1,2,3]);
  await provider.search('t:24 sortby:rec_Title');
  // IDs are folded into one JSON-encoded search predicate rather than a
  // separate top-level `ids` param, matching the standard Heurist /records/
  // query contract.
  assert.deepEqual(JSON.parse(queries[0].q),{t:24,ids:[1,2,3]});
  assert.equal(queries[1].q,'t:24 sortby:rec_Title');
});

test('RecordTypeProvider accepts a direct integer API response', async () => {
  const apiClient={async get(){return 24;}};
  const provider=new RecordTypeProvider({apiClient});
  assert.equal(await provider.getIdByConceptCode('3-1019'),24);
});
