import { useState, useEffect } from 'react'
import { supabase }  from '../lib/supabase'
import { useAuth }   from '../context/AuthContext'
import { toast }     from '../components/Toast'
import { useOutletContext } from 'react-router-dom'
import { calcDebt, buildPaidMap, moLabel } from '../utils'

const AS_CODE = `// NetPro Apps Script v2
function doPost(e){
  try{
    var d=JSON.parse(e.postData.contents);
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName(d.sheet||'Sheet1')||ss.getSheets()[0];
    if(d.action==='write'){
      sh.clearContents();
      if(d.rows&&d.rows.length)
        sh.getRange(1,1,d.rows.length,d.rows[0].length).setValues(d.rows);
      return out({ok:true,count:d.rows.length});
    }
    return out({ok:false,err:'unknown action'});
  }catch(err){return out({ok:false,err:err.toString()});}
}
function doGet(e){
  try{
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheets()[0];
    var data=sh.getDataRange().getValues();
    return out({ok:true,data:data,rows:data.length});
  }catch(err){return out({ok:false,err:err.toString()});}
}
function out(o){
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}`

export default function Sheets() {
  const { company } = useAuth()
  const { setGsConnected } = useOutletContext()

  const [config, setConfig]     = useState({ web_app_url: '', sheet_name: 'Sheet1' })
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync]   = useState(null)
  const [loading, setLoading]     = useState(false)
  const [previewData, setPreviewData] = useState(null)

  useEffect(() => { if (company) loadConfig() }, [company])

  async function loadConfig() {
    const { data } = await supabase
      .from('sheets_config').select('*')
      .eq('company_id', company.id).single()
    if (data) {
      setConfig({ web_app_url: data.web_app_url || '', sheet_name: data.sheet_name || 'Sheet1' })
      setConnected(data.is_connected || false)
      setLastSync(data.last_sync)
      setGsConnected(data.is_connected || false)
    }
  }

  async function saveAndTest() {
    if (!config.web_app_url.trim()) { toast('يرجى إدخال رابط Web App', 'e'); return }
    setLoading(true)
    try {
      await fetch(config.web_app_url, { method: 'GET', mode: 'no-cors' })
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
    if (!connected) { toast('الرجاء ربط Google Sheets أولاً', 'e'); return }
    toast('جاري رفع البيانات...', 'i')
    const [{ data: subs, error: e1 }, { data: pays, error: e2 }] = await Promise.all([
      supabase.from('subscribers').select('*').eq('company_id', company.id).eq('is_active', true),
      supabase.from('payments').select('subscriber_id,month').eq('company_id', company.id)
    ])
    if (e1 || e2) { toast('خطأ في جلب البيانات', 'e'); return }
    const pm = buildPaidMap(pays || [])
    const headers = ['الاسم', 'رقم الهاتف', 'تاريخ البداية', 'الرسم الشهري', 'آخر شهر مدفوع', 'أشهر الدين', 'إجمالي الدين (د.ع)', 'الحالة']
    const rows = (subs || []).map(s => {
      const d = calcDebt(s, pm[s.id] || [])
      return [s.name, s.phone, s.start_date, s.monthly_fee, moLabel(s.last_paid_month), d.length, d.length * s.monthly_fee, d.length > 0 ? 'متأخر' : 'مدفوع']
    })
    try {
      await fetch(config.web_app_url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', sheet: config.sheet_name, rows: [headers, ...rows] })
      })
      const now = new Date().toISOString()
      await supabase.from('sheets_config').upsert({ company_id: company.id, last_sync: now }, { onConflict: 'company_id' })
      setLastSync(now)
      toast(`تم رفع ${rows.length} مشترك إلى Google Sheets ✅`, 's')
    } catch {
      toast('خطأ في رفع البيانات', 'e')
    }
  }

  async function clearConfig() {
    await supabase.from('sheets_config').upsert({ company_id: company.id, web_app_url: '', is_connected: false }, { onConflict: 'company_id' })
    setConfig({ web_app_url: '', sheet_name: 'Sheet1' })
    setConnected(false); setGsConnected(false); setLastSync(null); setPreviewData(null)
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
      <p style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 18 }}>
        زامن بياناتك مع جداول Google ورفع المشتركين تلقائياً
      </p>

      {/* Connection status */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ fontSize: 30 }}>📊</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>حالة الاتصال</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {connected ? config.web_app_url.slice(0, 38) + '...' : 'غير متصل'}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: connected ? 'rgba(5,150,105,.1)' : 'var(--bg2)', color: connected ? '#059669' : 'var(--ink3)' }}>
              {connected ? '✅ متصل' : '⭕ غير متصل'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            <button className="btn btn-primary btn-sm" onClick={saveAndTest} disabled={loading}>
              {loading ? '⏳...' : '🔗 اختبار الاتصال'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearConfig}>🗑 إعادة تعيين</button>
          </div>
        </div>
      </div>

      {/* Setup steps */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="card-title" style={{ marginBottom: 14 }}>📋 خطوات الإعداد</div>

          {[
            {
              n: 1, title: 'افتح Google Sheets وأنشئ جدولاً',
              body: <a href="https://sheets.google.com" target="_blank" rel="noreferrer"
                className="btn btn-ghost btn-sm" style={{ display: 'inline-block', marginTop: 6 }}>🔗 فتح Google Sheets</a>
            },
            {
              n: 2, title: 'أضف كود Apps Script',
              body: (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '4px 0 8px', lineHeight: 1.6 }}>
                    من <strong>Extensions → Apps Script</strong> احذف الكود والصق هذا:
                  </p>
                  <pre style={{ background: 'var(--bg2)', borderRadius: 8, padding: 10, fontSize: 10, overflow: 'auto', maxHeight: 120, whiteSpace: 'pre', direction: 'ltr', border: '1px solid var(--bdr)' }}>
                    {AS_CODE}
                  </pre>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 9 }} onClick={copyScript}>
                    📋 نسخ الكود
                  </button>
                </div>
              )
            },
            {
              n: 3, title: 'انشر واربط الرابط',
              body: (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '4px 0 8px', lineHeight: 1.6 }}>
                    <strong>Deploy → New deployment → Web App → Anyone</strong>
                  </p>
                  <div className="field">
                    <div className="field-wrap">
                      <span className="field-icon">🔗</span>
                      <input className="field-input" placeholder="https://script.google.com/macros/s/..."
                        value={config.web_app_url}
                        onChange={e => setConfig({ ...config, web_app_url: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label">اسم الشيت</label>
                    <div className="field-wrap">
                      <span className="field-icon">📄</span>
                      <input className="field-input" value={config.sheet_name}
                        onChange={e => setConfig({ ...config, sheet_name: e.target.value })} />
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={saveAndTest} disabled={loading}>
                    {loading ? '⏳ جاري الاختبار...' : '💾 حفظ وربط'}
                  </button>
                </div>
              )
            }
          ].map(step => (
            <div key={step.n} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: step.n < 3 ? '1px solid var(--bdr)' : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#1a3fdb,#6144f5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{step.n}</div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>{step.title}</h4>
                {step.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sync */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="card-title" style={{ marginBottom: 12 }}>🔄 مزامنة البيانات</div>
          <button className="btn btn-primary" onClick={pushData} disabled={!connected} style={{ marginBottom: 10 }}>
            ⬆️ رفع بيانات المشتركين للجدول
          </button>
          {lastSync && (
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
              🕐 آخر مزامنة: {new Date(lastSync).toLocaleString('ar-IQ')}
            </div>
          )}
          <div style={{ marginTop: 14, background: 'rgba(26,63,219,.05)', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: 'var(--ink2)', lineHeight: 1.8 }}>
            💡 <strong>ملاحظة:</strong> لاستيراد بيانات من Google Sheets، صدّرها كـ CSV ثم استخدم زر "استيراد CSV" في صفحة المشتركين.
          </div>
        </div>
      </div>
    </div>
  )
}
