// ═══════════════════════════════════════════════════════════════
// AuthContext.jsx — أضف هذا السطر داخل دالة loadCompany()
// ═══════════════════════════════════════════════════════════════
//
// في الكود الحالي عندك شيء مثل:
//   const { data: company } = await supabase.from('companies').select('*')...
//
// أضف بعدها مباشرة:
//
//   setIsSuperAdmin(company?.is_super_admin === true)
//
// وأضف هذا الـ state في أعلى الـ context:
//   const [isSuperAdmin, setIsSuperAdmin] = useState(false)
//
// وأضفه في الـ value:
//   value={{ ..., isSuperAdmin }}
// ═══════════════════════════════════════════════════════════════

// مثال كامل على الإضافة في AuthContext:

/*
  // في أعلى الـ Provider function:
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // في loadCompany() بعد جلب بيانات الشركة:
  setIsSuperAdmin(data?.is_super_admin === true)

  // في return value:
  return (
    <AuthContext.Provider value={{
      user, company, isViewer, isSuperAdmin,
      trialDaysLeft, isTrialActive,
      // ... باقي القيم
    }}>
*/
