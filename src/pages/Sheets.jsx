import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'
import { useOutletContext } from 'react-router-dom'

// Google Apps Script code — supports both read and write
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
    if(d.action==='read'){
      var data=sh.getDataRange().getValues();
      return out({ok:true,data:data});
    }
    return out({ok:false,err:'unknown action'});
  }catch(err){return out({ok:false,err:err.toString()});}
}
function doGet(e){
  // Also support GET for reading
  try{
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheets()[0];
    var data=sh.getDataRange().getValues();
    return out({ok:true,data:data});
  }catch(err){return out({ok:false,err:err.toString()});}
}
function out(o){
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}`

const MO = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
            'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']

function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now     = new Date()
  const paidSet = new Set(paidMonths)
  const months  = []

  if (paidMonths.length > 0) {
    const startD = new Date(sub.start_date)
    let y = startD.getFullYear(), m = startD.getMonth() + 1
    while (new Date(y, m - 1) <= now) {
      const key = `${y}-${String(m).padStart(2,'0')}`
      if (!paidSet.has(key)) months.push(key)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  if (sub.last_paid_month) {
    const [ly, lm] = sub.last_paid_month.split('-').map(Number)
    let y = ly, m = lm + 1
    if (m > 12) { m = 1; y++ }
    while (new Date(y, m - 1) <= now) {
      months.push(`${y}-${String(m).padStart(2,'0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  const startD = new Date(sub.start_date)
  let y = startD.getFullYear(), m = startD.getMonth() + 1
  while (new Date(y, m - 1) <= now) {
    months.push(`${y}-${String(m).padStart(2,'0')}`)
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
  const [config, setConfig]   = useState({ web_app_url:'', sheet_name:'Sheet1' })
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync]   = useState(null)
  const [loading, setLoading]     = useState(false)
  const [pulling, setPulling]     = useState(false)
  const [previewData, setPreviewData] = useState(null) // pulled data preview

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
    try {
      await fetch(config.web_app_url, { method:'GET', mode:'no-cors' })
      const { error } = await supabase.from('sheets_config').upsert({
        company_id:   company.id,
        web_app_url:  config.web_app_url,
        sheet_name:   config.sheet_name || 'Sheet1',
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

  // ── Push data TO Sheets ─────────────────────────────────────
  async function pushData() {
    if (!connected || !config.web_app_url) {
      toast('الرجاء ربط Google Sheets أولاً', 'e'); return
    }
    toast('جاري رفع البيانات...', 'i')
    const { data: subs } = await supabase
      .from('subscribers').select('*')
      .eq('company_id', company.id).eq('is_active', true)
    const { data: pays } = await supabase
      .from('payments').select('subscriber_id,month').eq('company_id', company.id)
    const pm = {}
    for (const p of (pays||[])) {
      if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
      pm[p.subscriber_id].push(p.month)
    }
    const headers = ['الاسم','رقم الهاتف','تاريخ البداية',
      'الرسم الشهري','آخر شهر مدفوع','أشهر الدين','إجمالي الدين (د.ع)','الحالة']
    const rows = (subs||[]).map(s => {
      const d = calcDebt(s, pm[s.id]||[])
      return [
        s.name, s.phone, s.start_date,
        s.monthly_fee, moLabel(s.last_paid_month),
        d.length, d.length * s.monthly_fee,
        d.length > 0 ? 'متأخر' : 'مدفوع'
      ]
    })
    try {
      await fetch(config.web_app_url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action:'write', sheet: config.sheet_name, rows:[headers,...rows] })
      })
      const now = new Date().toISOString()
      await supabase.from('sheets_config').upsert({
        company_id: company.id, last_sync: now
      }, { onConflict: 'company_id' })
      setLastSync(now)
      toast(`تم رفع ${rows.length} مشترك إلى Google Sheets ✅`, 's')
    } catch {
      toast('خطأ في رفع البيانات', 'e')
    }
  }

  // ── Pull data FROM Sheets ────────────────────────────────────
  async function pullData() {
    if (!connected || !config.web_app_url) {
      toast('الرجاء ربط Google Sheets أولاً', 'e'); return
    }
    setPulling(true)
    toast('جاري جلب البيانات من الجدول...', 'i')
    try {
      // Use GET request to fetch data
      const url = config.web_app_url
      const res = await fetch(url, { method: 'GET', mode: 'cors' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const json = await res.json()
      if (!json.ok || !json.data) throw new Error(json.err || 'no data')
      const rows = json.data
      if (rows.length <= 1) { toast('الجدول فارغ أو يحتوي على رأس فقط', 'w'); setPulling(false); return }
      setPreviewData(rows)
      toast(`تم جلب ${rows.length - 1} صف من الجدول ✅`, 's')
    } catch(err) {
      // CORS issue — provide manual import option
      toast('تعذّر الجلب التلقائي — استخدم الاستيراد اليدوي أدناه', 'w')
      setPreviewData('cors-error')
    } finally { setPulling(false) }
  }

  // ── Import pulled rows into Supabase ────────────────────────
  async function importToSupabase() {
    if (!previewData || previewData === 'cors-error') return
    const [header, ...rows] = previewData
    // Map columns: name, phone, start_date, monthly_fee
    const nameIdx  = header.findIndex(h => String(h).includes('الاسم'))
    const phoneIdx = header.findIndex(h => String(h).includes('هاتف') || String(h).includes('phone'))
    const feeIdx   = header.findIndex(h => String(h).includes('شهري') || String(h).includes('fee'))
    const dateIdx  = header.findIndex(h => String(h).includes('بداية') || String(h).includes('date'))

    let imported = 0, skipped = 0
    for (const row of rows) {
      const name = row[nameIdx] || row[0]
      if (!name) { skipped++; continue }
      const phone   = phoneIdx >= 0 ? String(row[phoneIdx]) : ''
      const fee     = feeIdx   >= 0 ? parseFloat(row[feeIdx]) || 0 : 0
      const start   = dateIdx  >= 0 ? String(row[dateIdx]) : new Date().toISOString().slice(0,10)

      const { error } = await supabase.from('subscribers').insert({
        company_id:   company.id,
        name:         String(name).trim(),
        phone:        phone.trim(),
        monthly_fee:  fee,
        start_date:   start.slice(0,10) || new Date().toISOString().slice(0,10),
        is_active:    true,
      })
      if (!error) imported++; else skipped++
    }
    toast(`تم استيراد ${imported} مشترك ✅ (تخطي: ${skipped})`, 's')
    setPreviewData(null)
  }

  async function clearConfig() {
    await supabase.from('sheets_config').upsert({
      company_id: company.id, web_app_url:'', is_connected:false
    }, { onConflict:'company_id' })
    setConfig({ web_app_url:'', sheet_name:'Sheet1' })
    setConnected(false); setGsConnected(false)
    setLastSync(null); setPreviewData(null)
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
        زامن بياناتك مع جداول Google ورفع واستيراد المشتركين
      </p>

      {/* Status */}
      <div className="card" style={{marginBottom:14}}>
        <div className="card-body">
          <div style={{display:'flex',alignItems:'center',
            justifyContent:'space-between',marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:11}}>
              <div style={{fontSize:30}}>📊</div>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--ink)'}}>حالة الاتصال</div>
                <div style={{fontSize:12,color:'var(--ink3)',maxWidth:200,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {connected ? config.web_app_url.slice(0,40)+'...' : 'غير متصل'}
                </div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,fontWeight:700,
                color:connected?'#059669':'var(--ink3)'}}>
                {connected?'✅ متصل':'⭕ غير متصل'}
              </span>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
            <button className="btn btn-primary btn-sm"
              onClick={saveAndTest} disabled={loading}>
              {loading?'⏳...':'🔗 اختبار الاتصال'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearConfig}>
              🗑 إعادة تعيين
            </button>
          </div>
        </div>
      </div>

      {/* Setup steps */}
      <div className="settings-card" style={{marginBottom:14}}>
        <div className="settings-header">
          <div className="settings-icon" style={{background:'rgba(26,63,219,.08)'}}>📋</div>
          <div className="settings-title">خطوات الإعداد</div>
        </div>
        <div className="settings-body">
          {/* Step 1 */}
          <div className="gs-step">
            <div className="gs-num">1</div>
            <div className="gs-body">
              <h4>افتح Google Sheets وأنشئ جدولاً</h4>
              <a href="https://sheets.google.com" target="_blank" rel="noreferrer"
                className="btn btn-ghost btn-sm" style={{display:'inline-block',marginTop:6}}>
                🔗 فتح Google Sheets
              </a>
            </div>
          </div>

          {/* Step 2 */}
          <div className="gs-step">
            <div className="gs-num">2</div>
            <div className="gs-body">
              <h4>أضف كود Apps Script</h4>
              <p style={{fontSize:12,color:'var(--ink3)',margin:'4px 0 8px'}}>
                من <strong>Extensions → Apps Script</strong> احذف الكود الموجود والصق هذا:
              </p>
              <pre className="code-box" style={{fontSize:10,maxHeight:120,overflow:'auto'}}>
                {AS_CODE}
              </pre>
              <button className="btn btn-ghost btn-sm"
                style={{marginTop:9}} onClick={copyScript}>
                📋 نسخ الكود
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="gs-step" style={{marginBottom:0}}>
            <div className="gs-num">3</div>
            <div className="gs-body">
              <h4>انشر واربط الرابط</h4>
              <p style={{fontSize:12,color:'var(--ink3)',margin:'4px 0 8px'}}>
                <strong>Deploy → New deployment → Web App → Anyone</strong>
                {' '}ثم انسخ الرابط هنا:
              </p>
              <div className="field">
                <div className="field-wrap">
                  <span className="field-icon">🔗</span>
                  <input className="field-input"
                    placeholder="https://script.google.com/macros/s/..."
                    value={config.web_app_url}
                    onChange={e => setConfig({...config,web_app_url:e.target.value})}/>
                </div>
              </div>
              <div className="field">
                <label className="field-label">اسم الشيت</label>
                <div className="field-wrap">
                  <span className="field-icon">📄</span>
                  <input className="field-input"
                    value={config.sheet_name}
                    onChange={e => setConfig({...config,sheet_name:e.target.value})}/>
                </div>
              </div>
              <button className="btn btn-primary"
                onClick={saveAndTest} disabled={loading}>
                {loading?'⏳ جاري الاختبار...':'💾 حفظ وربط'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sync buttons */}
      <div className="card" style={{marginBottom:14}}>
        <div className="card-body">
          <div className="card-title" style={{marginBottom:12}}>🔄 مزامنة البيانات</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginBottom:12}}>
            {/* Push */}
            <button className="btn btn-primary" onClick={pushData} disabled={!connected}>
              ⬆️ رفع للجدول
            </button>
            {/* Pull */}
            <button className="btn btn-gold" onClick={pullData}
              disabled={!connected || pulling}
              style={{background:'linear-gradient(135deg,#065f46,#059669)',color:'#fff'}}>
              {pulling ? '⏳ جاري الجلب...' : '⬇️ جلب من الجدول'}
            </button>
          </div>
          {lastSync && (
            <div style={{fontSize:12,color:'var(--ink3)'}}>
              آخر مزامنة: {new Date(lastSync).toLocaleString('ar-IQ')}
            </div>
          )}
        </div>
      </div>

      {/* Pull result / preview */}
      {previewData === 'cors-error' && (
        <div style={{background:'rgba(234,179,8,.08)',border:'1px solid rgba(234,179,8,.3)',
          borderRadius:14,padding:16,marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:8}}>
            ⚠️ تعذّر الجلب التلقائي (CORS)
          </div>
          <div style={{fontSize:13,color:'var(--ink2)',lineHeight:1.8,marginBottom:12}}>
            Google Sheets يمنع الطلبات المباشرة من المتصفح. الحل:
          </div>
          <div style={{fontSize:13,color:'var(--ink2)',lineHeight:2,
            background:'var(--bg2)',borderRadius:10,padding:12,marginBottom:12}}>
            1️⃣ افتح الجدول في Google Sheets<br/>
            2️⃣ اضغط <strong>File → Download → CSV</strong><br/>
            3️⃣ استخدم زر "استيراد CSV" في صفحة المشتركين
          </div>
          <button className="btn btn-ghost btn-sm"
            onClick={() => setPreviewData(null)}>
            إغلاق
          </button>
        </div>
      )}

      {previewData && previewData !== 'cors-error' && (
        <div style={{background:'rgba(5,150,105,.06)',border:'1px solid rgba(5,150,105,.2)',
          borderRadius:14,padding:16,marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:8}}>
            ✅ تم جلب البيانات — {previewData.length - 1} صف
          </div>
          {/* Preview table */}
          <div style={{overflowX:'auto',marginBottom:12}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr>
                  {previewData[0]?.map((h,i) => (
                    <th key={i} style={{padding:'6px 8px',background:'var(--bg2)',
                      textAlign:'right',fontWeight:700,borderBottom:'1px solid var(--bdr)'}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.slice(1,6).map((row,i) => (
                  <tr key={i}>
                    {row.map((cell,j) => (
                      <td key={j} style={{padding:'5px 8px',
                        borderBottom:'1px solid var(--bdr)',color:'var(--ink2)'}}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {previewData.length > 7 && (
              <div style={{fontSize:11,color:'var(--ink3)',textAlign:'center',padding:6}}>
                ... و {previewData.length - 7} صف آخر
              </div>
            )}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
            <button className="btn btn-primary" onClick={importToSupabase}>
              📥 استيراد للنظام
            </button>
            <button className="btn btn-ghost" onClick={() => setPreviewData(null)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      <style>{`
        .gs-step { display:flex; gap:12px; padding:12px 0;
          border-bottom:1px solid var(--bdr); }
        .gs-step:last-child { border-bottom:none; }
        .gs-num { width:28px; height:28px; border-radius:50%; flex-shrink:0;
          background:linear-gradient(135deg,#1a3fdb,#6144f5);
          color:#fff; display:flex; align-items:center; justify-content:center;
          font-size:13px; font-weight:900; }
        .gs-body h4 { font-size:13px; font-weight:800; color:var(--ink); margin-bottom:4px; }
        .gs-body p  { font-size:12px; color:var(--ink3); line-height:1.6; }
        .code-box { background:var(--bg2); border-radius:8px; padding:10px;
          font-size:10px; overflow:auto; white-space:pre; direction:ltr;
          border:1px solid var(--bdr); }
      `}</style>
    </div>
  )
}
