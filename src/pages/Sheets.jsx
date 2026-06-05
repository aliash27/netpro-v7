import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'
import { useOutletContext } from 'react-router-dom'

const AS_CODE = `function doPost(e){
  try{
    var d=JSON.parse(e.postData.contents);
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName(d.sheet||'Sheet1')||ss.getSheets()[0];
    if(d.action==='write'){
      sh.clearContents();
      if(d.rows&&d.rows.length)
        sh.getRange(1,1,d.rows.length,d.rows[0].length).setValues(d.rows);
      return out({ok:true});
    }
    return out({ok:false,err:'unknown'});
  }catch(e){return out({ok:false,err:e.toString()});}
}
function doGet(){return out({status:'ok',app:'NetPro v1'});}
function out(o){
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}`

const MO = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
            'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']

function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now = new Date()
  const startD = new Date(sub.start_date)
  const paidSet = new Set(paidMonths)
  const months = []
  let y = startD.getFullYear(), m = startD.getMonth() + 1
  while (new Date(y, m - 1) <= now) {
    const key = `${y}-${String(m).padStart(2,'0')}`
    if (!paidSet.has(key)) months.push(key)
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

function moLabel(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MO[parseInt(m)-1]} ${y}`
}

export default function Sheets() {
  const { company } = useAuth()
  const { setGsConnected } = useOutletContext()
  const [config, setConfig] = useState({ web_app_url:'', sheet_name:'Sheet1' })
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync]   = useState(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => { if (company) loadConfig() }, [company])

  async function loadConfig() {
    const { data } = await supabase
      .from('sheets_config').select('*')
      .eq('company_id', company.id).single()
    if (data) {
      setConfig({ web_app_url: data.web_app_url||'', sheet_name: data.sheet_name||'Sheet1' })
      setConnected(data.is_connected || false)
      setLastSync(data.last_sync)
      setGsConnected(data.is_connected || false)
    }
  }

  async function saveAndTest() {
    if (!config.web_app_url.trim()) { toast('يرجى إدخال رابط Web App', 'e'); return }
    setLoading(true)
    toast('جاري اختبار الاتصال...', 'i')
    try {
      await fetch(config.web_app_url, { method:'GET', mode:'no-cors' })
      const { error } = await supabase.from('sheets_config').upsert({
        company_id: company.id,
        web_app_url: config.web_app_url,
        sheet_name: config.sheet_name || 'Sheet1',
        is_connected: true
      }, { onConflict: 'company_id' })
      if (error) throw error
      setConnected(true)
      setGsConnected(true)
      toast('تم الاتصال بـ Google Sheets ✅', 's')
    } catch {
      toast('فشل الاتصال — تحقق من الرابط وإعدادات النشر', 'e')
    } finally { setLoading(false) }
  }

  async function pushData() {
    if (!connected || !config.web_app_url) {
      toast('الرجاء ربط Google Sheets أولاً', 'e'); return
    }
    toast('جاري رفع البيانات...', 'i')
    const { data: subs } = await supabase
      .from('subscribers').select('*')
      .eq('company_id', company.id).eq('is_active', true)

    const { data: pays } = await supabase
      .from('payments').select('subscriber_id,month').eq('company_id',company.id)
    const pm = {}
    for (const p of (pays||[])) {
      if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
      pm[p.subscriber_id].push(p.month)
    }
    const headers = ['ID','الاسم','رقم الهاتف','تاريخ البداية',
      'الرسم الشهري','آخر شهر مدفوع','أشهر الدين','إجمالي الدين (د.ع)','ملاحظات']
    const rows = (subs || []).map(s => {
      const d = calcDebt(s, pm[s.id]||[])
      return [s.id, s.name, s.phone, s.start_date,
              s.monthly_fee, moLabel(s.last_paid_month),
              d.length, d.length * s.monthly_fee, s.notes || '']
    })

    try {
      await fetch(config.web_app_url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'write',
          sheet: config.sheet_name,
          rows: [headers, ...rows]
        })
      })
      const now = new Date().toISOString()
      await supabase.from('sheets_config').upsert({
        company_id: company.id, last_sync: now
      }, { onConflict: 'company_id' })
      setLastSync(now)
      toast('تم رفع البيانات لـ Google Sheets ✅', 's')
    } catch {
      toast('خطأ في رفع البيانات', 'e')
    }
  }

  async function clearConfig() {
    await supabase.from('sheets_config').upsert({
      company_id: company.id,
      web_app_url: '', is_connected: false
    }, { onConflict: 'company_id' })
    setConfig({ web_app_url:'', sheet_name:'Sheet1' })
    setConnected(false)
    setGsConnected(false)
    setLastSync(null)
    toast('تم مسح إعدادات Google Sheets', 'i')
  }

  function copyScript() {
    navigator.clipboard.writeText(AS_CODE)
      .then(() => toast('تم نسخ الكود ✅', 's'))
      .catch(() => toast('انسخ الكود يدوياً', 'w'))
  }

  return (
    <div className="page">
      <div className="page-title">🔗 ربط Google Sheets</div>
      <p style={{fontSize:13,color:'var(--ink3)',marginBottom:18}}>
        زامن بياناتك تلقائياً مع جدول Google
      </p>

      {/* Status card */}
      <div className="card" style={{marginBottom:14}}>
        <div className="card-body">
          <div style={{display:'flex',alignItems:'center',
            justifyContent:'space-between',marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:11}}>
              <div style={{fontSize:30}}>📊</div>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--ink)'}}>
                  حالة الاتصال
                </div>
                <div style={{fontSize:13,color:'var(--ink3)'}}>
                  {connected
                    ? `متصل — ${config.web_app_url.slice(0,30)}...`
                    : 'غير متصل'}
                </div>
              </div>
            </div>
            <div style={{
              width:12,height:12,borderRadius:'50%',
              background: connected ? 'var(--green)' : 'var(--bg3)',
              boxShadow: connected ? '0 0 8px rgba(5,150,105,.5)' : 'none',
              animation: connected ? 'pulse 2.5s infinite' : 'none'
            }}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
            <button className="btn btn-primary btn-sm"
              onClick={saveAndTest} disabled={loading}>
              {loading ? '⏳...' : '🔗 اختبار الاتصال'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearConfig}>
              🗑 إعادة تعيين
            </button>
          </div>
        </div>
      </div>

      {/* Setup steps */}
      <div className="settings-card">
        <div className="settings-header">
          <div className="settings-icon"
            style={{background:'rgba(26,63,219,.08)'}}>📋</div>
          <div className="settings-title">خطوات الإعداد</div>
        </div>
        <div className="settings-body">
          <div className="gs-step">
            <div className="gs-num">1</div>
            <div className="gs-body">
              <h4>افتح Google Sheets وأنشئ جدولاً</h4>
              <p>اذهب إلى{' '}
                <a href="https://sheets.google.com" target="_blank"
                  rel="noreferrer">sheets.google.com</a>
                {' '}وأنشئ جدول جديد.
              </p>
            </div>
          </div>

          <div className="gs-step">
            <div className="gs-num">2</div>
            <div className="gs-body">
              <h4>أضف كود Apps Script</h4>
              <p>من <strong>Extensions → Apps Script</strong> احذف الكود الموجود والصق هذا:</p>
              <pre className="code-box">{AS_CODE}</pre>
              <button className="btn btn-ghost btn-sm"
                style={{marginTop:9}} onClick={copyScript}>
                📋 نسخ الكود
              </button>
            </div>
          </div>

          <div className="gs-step" style={{marginBottom:0}}>
            <div className="gs-num">3</div>
            <div className="gs-body">
              <h4>انشر واربط الرابط</h4>
              <p>
                <strong>Deploy → New deployment → Web App → Anyone</strong>
                {' '}ثم انسخ الرابط هنا:
              </p>
              <div className="field" style={{marginTop:11}}>
                <div className="field-wrap">
                  <span className="field-icon">🔗</span>
                  <input className="field-input"
                    placeholder="https://script.google.com/macros/s/..."
                    value={config.web_app_url}
                    onChange={e => setConfig({
                      ...config, web_app_url: e.target.value
                    })}/>
                </div>
              </div>
              <div className="field">
                <label className="field-label">اسم الشيت</label>
                <div className="field-wrap">
                  <span className="field-icon">📄</span>
                  <input className="field-input"
                    value={config.sheet_name}
                    onChange={e => setConfig({
                      ...config, sheet_name: e.target.value
                    })}/>
                </div>
              </div>
              <button className="btn btn-primary"
                onClick={saveAndTest} disabled={loading}>
                {loading ? '⏳ جاري الاختبار...' : '💾 حفظ وربط'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sync */}
      <div className="card" style={{marginTop:14}}>
        <div className="card-body">
          <div className="card-title">🔄 مزامنة البيانات</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
            <button className="btn btn-primary" onClick={pushData}>
              ⬆️ رفع للجدول
            </button>
            <button className="btn btn-ghost"
              onClick={() => toast('جلب البيانات يتطلب ضبط CORS في Apps Script', 'w')}>
              ⬇️ جلب من الجدول
            </button>
          </div>
          <div style={{marginTop:11,fontSize:12,color:'var(--ink3)'}}>
            آخر مزامنة:{' '}
            <span>
              {lastSync
                ? new Date(lastSync).toLocaleString('ar')
                : 'لم تتم بعد'}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:1} 50%{opacity:.4}
        }
      `}</style>
    </div>
  )
}
