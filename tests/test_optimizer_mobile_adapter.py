import asyncio
import base64
import io
import json
import pathlib
import sys
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'optimizer'))
from backend import mobile_adapter as m, models

class MobileAdapterTests(unittest.TestCase):
    def call(self,path,payload=None,form=None):
        return asyncio.run(m.dispatch(path,payload or {},form or {}))
    def test_default_field_form_values_are_plain_serializable_types(self):
        async def fake(file,**opts):
            return {'name':file.filename,**opts}
        form={'file':{'name':'bad<script>.csv','content':base64.b64encode(b'a,b').decode()}}
        with patch.object(m.app,'analyze_fieldtest',side_effect=fake):
            result=self.call('/api/fieldtest/analyze',form=form)
        body=json.loads(result['body']);self.assertEqual(result['status'],200)
        self.assertIsNone(body['warranty_start_date']);self.assertEqual(body['warranty_term_years'],25)
        self.assertNotIn('<',body['name'])
    def test_archive_entry_limit(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            for i in range(101):z.writestr(str(i),b'x')
        r=self.call('/api/fieldtest/analyze',form={'file':{'name':'files.zip','content':base64.b64encode(out.getvalue()).decode()}})
        self.assertEqual(r['status'],400);self.assertIn('ZIP exceeds',r['body'])
    def test_rejects_unverified_horizon(self):
        result=self.call('/api/analyze',payload={'plant':{'apply_horizon':True}})
        self.assertEqual(result['status'],400);self.assertIn('Horizon',result['body'])
    def test_rejects_too_large_single_search(self):
        grid=models.SweepIn(tilt_min=1,tilt_max=45,tilt_step=2,az_min=1,az_max=360,az_step=5)
        with self.assertRaisesRegex(ValueError,'300 coarse'):m._limit_sweep(grid)
    def test_longterm_five_year_limit(self):
        payload={'location':{'lat':7,'lon':80},'panel':{'pmpp_w':660},'plant':{'dc_mw':1,'ac_mw':1},'tilt':10,'start_year':2010,'end_year':2020}
        result=self.call('/api/longterm',payload)
        self.assertEqual(result['status'],400);self.assertIn('five years',result['body'])

if __name__=='__main__':unittest.main()
