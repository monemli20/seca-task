import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'

export default function ProjectDetail() {
    const { projectId } = useParams()
    const { user, signOut } = useAuth()
    const navigate = useNavigate()

    const [profile, setProfile] = useState(null)
    const [project, setProject] = useState(null)
    const [categories, setCategories] = useState([])
    const [stepEntries, setStepEntries] = useState([])
    const [loading, setLoading] = useState(true)

    const [newStepContent, setNewStepContent] = useState('')
    const [newStepStart, setNewStepStart] = useState('')
    const [newStepDue, setNewStepDue] = useState('')
    const [activeCategoryId, setActiveCategoryId] = useState(null)

    const [editingStepId, setEditingStepId] = useState(null)
    const [editStepContent, setEditStepContent] = useState('')
    const [editStepStart, setEditStepStart] = useState('')
    const [editStepDue, setEditStepDue] = useState('')

    useEffect(() => {
        if (user && projectId) {
            fetchProfile()
            fetchProjectData()
        }
    }, [user, projectId])

    async function fetchProfile() {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
    }

    async function fetchProjectData() {
        try {
            setLoading(true)

            // 1. Proje Bilgileri
            const { data: projData, error: projError } = await supabase
                .from('projects')
                .select('*, creator:profiles!projects_created_by_fkey(full_name)')
                .eq('id', projectId)
                .single()

            if (projError) throw projError

            const { data: assignments } = await supabase
                .from('project_assignments')
                .select('profiles(id, full_name, role, unit)')
                .eq('project_id', projectId)

            setProject({ ...projData, assignments: assignments || [] })

            // 2. Proje Kategorileri
            const { data: catData } = await supabase
                .from('project_categories')
                .select('*')
                .eq('project_id', projectId)
                .order('id', { ascending: true })

            setCategories(catData || [])

            // 3. Proje Adım Girdileri
            // Sadece bu projenin kategorilerine ait
            if (catData && catData.length > 0) {
                const catIds = catData.map(c => c.id)
                const { data: stepData } = await supabase
                    .from('project_step_entries')
                    .select('*, creator:profiles!project_step_entries_created_by_fkey(full_name)')
                    .in('category_id', catIds)
                    .order('created_at', { ascending: true })
                    .order('id', { ascending: true })
                setStepEntries(stepData || [])
            }

        } catch (error) {
            console.error('Proje detayları alınamadı:', error)
            alert('Proje bulunamadı veya detay alınamıyor.')
        } finally {
            setLoading(false)
        }
    }

    const isAuthorized = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'unit_manager' || profile?.role === 'manager'

    // Standart veya yetkili kullanıcılar alt kategoriyi tamamlandı olarak işaretler
    async function toggleCategoryComplete(categoryId, currentStatus) {
        try {
            const { error } = await supabase
                .from('project_categories')
                .update({ 
                    is_completed: !currentStatus, 
                    completed_by: !currentStatus ? user.id : null,
                    completed_at: !currentStatus ? new Date().toISOString() : null
                })
                .eq('id', categoryId)

            if (error) throw error
            fetchProjectData()
        } catch (error) {
            alert('Kategori güncellenirken hata: ' + error.message)
        }
    }

    // Standart (veya yetkili) kullanıcılar adım ekler
    async function handleAddStep(categoryId) {
        if (!newStepContent.trim()) return

        try {
            const { error } = await supabase.from('project_step_entries').insert([{
                category_id: categoryId,
                content: newStepContent,
                start_date: newStepStart || null,
                due_date: newStepDue || null,
                status: 'pending',
                created_by: user.id
            }])

            if (error) throw error
            
            setNewStepContent('')
            setNewStepStart('')
            setNewStepDue('')
            setActiveCategoryId(null)
            fetchProjectData()
        } catch (error) {
            alert('Adım eklenirken hata: ' + error.message)
        }
    }

    // Adım Silme
    async function handleDeleteStep(stepId) {
        if (!confirm('Bu adımı / notu silmek istediğinize emin misiniz?')) return
        try {
            const { error } = await supabase.from('project_step_entries').delete().eq('id', stepId)
            if (error) throw error
            fetchProjectData()
        } catch (error) {
            alert('Silinirken hata oluştu: ' + error.message)
        }
    }

    // Adım Güncelleme
    async function handleUpdateStep(stepId) {
        if (!editStepContent.trim()) return
        try {
            const { error } = await supabase.from('project_step_entries')
                .update({ 
                    content: editStepContent,
                    start_date: editStepStart || null,
                    due_date: editStepDue || null
                })
                .eq('id', stepId)
            
            if (error) throw error
            setEditingStepId(null)
            fetchProjectData()
        } catch (error) {
            alert('Güncellenirken hata: ' + error.message)
        }
    }

    // Kategorileri grupla (Main -> Sub)
    const groupedCategories = categories.reduce((acc, cat) => {
        if (!acc[cat.main_category]) acc[cat.main_category] = []
        acc[cat.main_category].push(cat)
        return acc
    }, {})

    // Main kategori statüsünü hesapla
    const getMainCategoryStatus = (mainCategoryName, subCats) => {
        if (project?.category_status?.[mainCategoryName] === 'completed') {
            return 'completed'
        }
        
        const subIds = subCats.map(s => s.id)
        const hasEntries = stepEntries.some(e => subIds.includes(e.category_id))
        const hasCompletedSubCats = subCats.some(s => s.is_completed)
        
        return (hasEntries || hasCompletedSubCats) ? 'in_progress' : 'pending'
    }

    // Main kategoriyi tamamla
    const toggleMainCategoryComplete = async (mainCategoryName) => {
        if (!isAuthorized) {
            alert('Bu işlemi yapmak için yetkiniz yoktur.')
            return
        }
        
        const currentStatus = project.category_status?.[mainCategoryName] === 'completed'
        const newStatus = currentStatus ? null : 'completed'
        const updatedStatus = { ...(project.category_status || {}), [mainCategoryName]: newStatus }

        try {
            const { error } = await supabase.from('projects')
                .update({ category_status: updatedStatus })
                .eq('id', project.id)
                
            if (error) throw error
            fetchProjectData()
        } catch (error) {
            alert('Durum güncellenirken hata: ' + error.message)
        }
    }

    // Birimlere göre atamaları grupla
    const groupedAssignments = project?.assignments?.reduce((acc, a) => {
        const unit = a.profiles.unit || 'Diğer'
        if (!acc[unit]) acc[unit] = []
        acc[unit].push(a)
        return acc
    }, {}) || {}

    // Proje İlerleme Yüzdesi
    const totalSubCats = categories.length
    const completedSubCats = categories.filter(c => c.is_completed).length
    const progressPercentage = totalSubCats === 0 ? 0 : Math.round((completedSubCats / totalSubCats) * 100)


    if (loading) return <div className="h-screen bg-[#f6f7f8] flex items-center justify-center">Yükleniyor...</div>
    if (!project) return <div className="h-screen bg-[#f6f7f8] flex items-center justify-center">Proje Bulunamadı!</div>

    return (
        <div className="bg-[#101922] text-white font-['Inter'] overflow-hidden h-screen flex w-full">
            {/* Sidebar */}
            <aside className="flex flex-col w-64 h-full bg-[#101922] border-r border-[#233648] shrink-0 transition-all duration-300">
                <div className="p-6 flex items-center gap-3">
                    <img src="/assets/seca-logo.png" alt="SECA" className="h-8 w-auto" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                    <div className="hidden size-8 bg-[#137fec] rounded-lg items-center justify-center text-white">
                        <span className="material-symbols-outlined text-xl">dataset</span>
                    </div>
                    <h1 className="text-white text-lg font-bold tracking-tight">SecaTask</h1>
                </div>

                <nav className="flex-1 px-4 flex flex-col gap-2 mt-4">
                    <Link to="/dashboard" className="flex items-center gap-3 px-3 py-3 rounded-lg text-[#92adc9] hover:bg-[#233648] hover:text-white transition-colors group">
                        <span className="material-symbols-outlined">dashboard</span>
                        <span className="text-sm font-medium">Dashboard</span>
                    </Link>
                    <Link to="/projects" className="flex items-center gap-3 px-3 py-3 rounded-lg bg-[#137fec] text-white shadow-lg shadow-[#137fec]/20 group">
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                        <span className="text-sm font-medium">Projeler</span>
                    </Link>
                    {(profile?.role === 'unit_manager' || profile?.role === 'super_admin') && (
                        <Link to="/team-stats" className="flex items-center gap-3 px-3 py-3 rounded-lg text-[#92adc9] hover:bg-[#233648] hover:text-white transition-colors group">
                            <span className="material-symbols-outlined">groups</span>
                            <span className="text-sm font-medium">Team Stats</span>
                        </Link>
                    )}
                </nav>

                <div className="p-4 border-t border-[#233648]">
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#233648] cursor-pointer transition-colors group">
                        <div className="size-10 rounded-full bg-gradient-to-br from-[#137fec] to-indigo-600 flex items-center justify-center text-white font-bold">
                            {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col overflow-hidden flex-1">
                            <p className="text-white text-sm font-medium truncate">{profile?.full_name || user?.email}</p>
                            <p className="text-[#92adc9] text-xs truncate">
                                {profile?.role === 'admin' ? 'Admin' : profile?.unit || 'User'}
                            </p>
                        </div>
                        <button onClick={signOut} className="opacity-0 group-hover:opacity-100 transition-opacity" title="Çıkış Yap">
                            <span className="material-symbols-outlined text-[#92adc9] text-sm hover:text-red-400">logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full bg-[#f6f7f8] overflow-hidden relative">
                <header className="h-20 px-8 flex items-center gap-4 bg-white border-b border-slate-200 shrink-0">
                    <button onClick={() => navigate('/projects')} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors">
                        <span className="material-symbols-outlined text-lg">arrow_back</span>
                    </button>
                    <div className="flex-1">
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-widest">{project.code || 'BİLGİ'}</span>
                                    <h2 className="text-xl font-bold text-slate-800">{project.name}</h2>
                                </div>
                                <p className="text-slate-500 text-sm">{project.description || 'Proje detayları'}</p>
                            </div>
                            <div className="w-64">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-semibold text-slate-500">Proje İlerlemesi</span>
                                    <span className="text-xs font-bold text-indigo-600">%{progressPercentage}</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2.5">
                                    <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progressPercentage}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 text-slate-800 flex flex-col items-center">
                    <div className="max-w-5xl w-full">
                        
                        {/* Proje Ekip ve Detay Katmanı */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8 flex justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wide">Görevli Ekip</h3>
                                <div className="space-y-4">
                                    {Object.entries(groupedAssignments).length > 0 ? (
                                        Object.entries(groupedAssignments).map(([unit, assignments]) => (
                                            <div key={unit}>
                                                <div className="text-xs font-bold text-indigo-500 mb-2 border-b border-slate-100 pb-1">{unit}</div>
                                                <div className="flex gap-2 flex-wrap">
                                                    {assignments.map(a => (
                                                        <span key={a.profiles.id} className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 flex items-center gap-2 shadow-sm">
                                                            <span className="material-symbols-outlined text-[16px] text-slate-400">person</span>
                                                            {a.profiles.full_name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <span className="text-slate-400 text-sm">Atanan kişi yok</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <h3 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">Tarihler</h3>
                                <p className="text-sm font-medium">Bitiş: {project.due_date ? new Date(project.due_date).toLocaleDateString('tr-TR') : 'Belirtilmedi'}</p>
                            </div>
                        </div>

                        {/* Adımlar Hiyerarşisi */}
                        <h2 className="text-xl font-black text-slate-800 mb-6 border-b border-slate-300 pb-2">PROJE ADIMLARI VE ONAYLARI</h2>

                        {Object.entries(groupedCategories).length === 0 ? (
                            <div className="text-center p-12 bg-white rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-lg text-slate-600">Herhangi bir kategori/şablon eklenmemiş.</h3>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {Object.entries(groupedCategories).map(([mainCat, subCats]) => {
                                    const status = getMainCategoryStatus(mainCat, subCats);
                                    const isCompleted = status === 'completed';
                                    
                                    return (
                                        <div key={mainCat} className={`bg-white rounded-xl border ${isCompleted ? 'border-green-300 shadow-green-100' : 'border-slate-300'} shadow-sm overflow-hidden`}>
                                            {/* Ana Kategori Başlığı */}
                                            <div className={`p-4 flex items-center justify-between border-b ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <button 
                                                        onClick={() => toggleMainCategoryComplete(mainCat)}
                                                        disabled={!isAuthorized}
                                                        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${!isAuthorized ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-indigo-500'} ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-300 text-transparent'}`}
                                                    >
                                                        ✓
                                                    </button>
                                                    <h3 className={`text-lg font-bold ${isCompleted ? 'text-green-800' : 'text-slate-800'}`}>{mainCat}</h3>
                                                </div>
                                                <div className="flex items-center">
                                                    {status === 'completed' && <span className="text-xs font-bold text-green-600 bg-green-100 px-2.5 py-1 rounded-full">✓ TAMAMLANDI</span>}
                                                    {status === 'in_progress' && <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">⏳ DEVAM EDİYOR</span>}
                                                    {status === 'pending' && <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2.5 py-1 rounded-full">⏸ BEKLEMEDE</span>}
                                                </div>
                                            </div>

                                            {/* Alt Kategoriler Listesi */}
                                            <div className="p-0">
                                                {subCats.map((sub, index) => {
                                                    const subEntries = stepEntries.filter(e => e.category_id === sub.id)
                                                    
                                                    return (
                                                    <div key={sub.id} className={`p-4 ${index !== subCats.length -1 ? 'border-b border-slate-100' : ''}`}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-3">
                                                                <button 
                                                                    onClick={() => toggleCategoryComplete(sub.id, sub.is_completed)}
                                                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer hover:border-indigo-500 ${sub.is_completed ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-300 text-transparent'}`}
                                                                >
                                                                    <span className="text-[12px] font-bold">✓</span>
                                                                </button>
                                                                <h4 className={`text-md font-semibold ${sub.is_completed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
                                                                    {sub.sub_category.split(' ').map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)).join(' ')}
                                                                </h4>
                                                            </div>
                                                            <button 
                                                                onClick={() => setActiveCategoryId(activeCategoryId === sub.id ? null : sub.id)}
                                                                className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[16px]">add</span> Adım / Not Ekle
                                                            </button>
                                                        </div>

                                                        {/* Step Ekleme Formu */}
                                                        {activeCategoryId === sub.id && (
                                                            <div className="ml-8 mt-3 mb-3 p-4 bg-slate-50 border border-indigo-100 rounded-lg animate-in slide-in-from-top-2">
                                                                <div className="flex flex-col gap-3">
                                                                    <div>
                                                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Açıklama / Not *</label>
                                                                        <input 
                                                                            type="text" 
                                                                            value={newStepContent}
                                                                            onChange={e => setNewStepContent(e.target.value)}
                                                                            onKeyPress={e => e.key === 'Enter' && handleAddStep(sub.id)}
                                                                            placeholder="Yapılan işlemi veya notu yazın..." 
                                                                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none block"
                                                                        />
                                                                    </div>
                                                                    <div className="flex gap-4">
                                                                        <div className="flex-1">
                                                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Başlangıç Tarihi</label>
                                                                            <input type="date" value={newStepStart} onChange={e => setNewStepStart(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700" />
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Bitiş Tarihi</label>
                                                                            <input type="date" value={newStepDue} onChange={e => setNewStepDue(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-end pt-2">
                                                                        <button onClick={() => setActiveCategoryId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 text-sm font-medium rounded-lg transition-colors mr-2">İptal</button>
                                                                        <button onClick={() => handleAddStep(sub.id)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">Gönder</button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Eklenen Adımların Listesi */}
                                                        {subEntries.length > 0 && (
                                                            <div className="ml-8 mt-3 space-y-2">
                                                                {subEntries.map(entry => (
                                                                    <div key={entry.id} className="group flex flex-col p-3 bg-slate-50 border border-slate-100 rounded-lg hover:border-slate-300 transition-colors">
                                                                            {editingStepId === entry.id ? (
                                                                                <div className="w-full">
                                                                                    <div className="flex flex-col gap-2 w-full mb-2">
                                                                                        <input type="text" value={editStepContent} onChange={e => setEditStepContent(e.target.value)} className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Not..." />
                                                                                        <div className="flex gap-2">
                                                                                            <input type="date" value={editStepStart} onChange={e => setEditStepStart(e.target.value)} className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none" />
                                                                                            <input type="date" value={editStepDue} onChange={e => setEditStepDue(e.target.value)} className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none" />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex justify-end gap-2">
                                                                                        <button onClick={() => setEditingStepId(null)} className="px-3 py-1 text-xs text-slate-600 bg-slate-200 hover:bg-slate-300 rounded">İptal</button>
                                                                                        <button onClick={() => handleUpdateStep(entry.id)} className="px-3 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded">Kaydet</button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="flex-1">
                                                                                        <div className="flex items-center gap-2 mb-1">
                                                                                            <span className="text-xs font-bold text-slate-800">{entry.creator?.full_name}</span>
                                                                                            <span className="text-[10px] text-slate-400">Eklenme: {new Date(entry.created_at).toLocaleDateString('tr-TR')}</span>
                                                                                        </div>
                                                                                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{entry.content}</p>
                                                                                        {(entry.start_date || entry.due_date) && (
                                                                                            <div className="mt-2 text-[10px] font-medium text-slate-500 flex gap-3">
                                                                                                {entry.start_date && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">calendar_today</span> Başlangıç: {new Date(entry.start_date).toLocaleDateString('tr-TR')}</span>}
                                                                                                {entry.due_date && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">event</span> Bitiş: {new Date(entry.due_date).toLocaleDateString('tr-TR')}</span>}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex items-start gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                        <button 
                                                                                            onClick={() => {
                                                                                                setEditingStepId(entry.id)
                                                                                                setEditStepContent(entry.content)
                                                                                                setEditStepStart(entry.start_date ? entry.start_date.split('T')[0] : '')
                                                                                                setEditStepDue(entry.due_date ? entry.due_date.split('T')[0] : '')
                                                                                            }}
                                                                                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 transition-colors" title="Düzenle"
                                                                                        >
                                                                                            <span className="material-symbols-outlined text-[14px]">edit</span>
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={() => handleDeleteStep(entry.id)}
                                                                                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 transition-colors" title="Sil"
                                                                                        >
                                                                                            <span className="material-symbols-outlined text-[14px]">delete</span>
                                                                                        </button>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )})}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        
                        {/* Sayfa Alt Boşluğu İçin */}
                        <div className="h-12"></div>
                    </div>
                </div>
            </main>
        </div>
    )
}
