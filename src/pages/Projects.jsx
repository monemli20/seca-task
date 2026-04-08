import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'

export default function Projects() {
    const { user, signOut } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [profile, setProfile] = useState(null)
    const [projects, setProjects] = useState([])
    const [loading, setLoading] = useState(true)
    const [availableUsers, setAvailableUsers] = useState([])

    // Modal state
    const [showModal, setShowModal] = useState(false)
    const [editingProject, setEditingProject] = useState(null)
    const [newProject, setNewProject] = useState({
        name: '',
        code: '',
        description: '',
        start_date: '',
        due_date: '',
        assignedUsers: [],
        categories: {
            pano: false,
            yazilim: false,
            saha: false,
            test: false
        }
    })

    useEffect(() => {
        if (user) {
            fetchProfile()
            fetchUsers()
        }
    }, [user])

    useEffect(() => {
        if (profile) {
            fetchProjects()
        }
    }, [profile])

    async function fetchProfile() {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
    }

    async function fetchUsers() {
        // Sadece takım üyelerini falan getirebiliriz
        const { data } = await supabase.from('profiles').select('id, full_name, username, role, unit').neq('username', 'super_admin')
        if (data) setAvailableUsers(data)
    }

    async function fetchProjects() {
        try {
            setLoading(true)

            const isSuperOrAdmin = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'manager'
            const isUnitManager = profile?.role === 'unit_manager'

            let projectIds = null

            if (!isSuperOrAdmin) {
                if (isUnitManager) {
                    // Birim amiri: kendi birimindeki kullanıcıların atandığı projeleri gör
                    const { data: unitProfiles } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('unit', profile.unit)

                    const unitUserIds = (unitProfiles || []).map(p => p.id)

                    const { data: unitAssignments } = await supabase
                        .from('project_assignments')
                        .select('project_id')
                        .in('user_id', unitUserIds)

                    projectIds = [...new Set((unitAssignments || []).map(a => a.project_id))]
                } else {
                    // Standart kullanıcı: sadece kendisine atanan projeler
                    const { data: myAssignments } = await supabase
                        .from('project_assignments')
                        .select('project_id')
                        .eq('user_id', user.id)

                    projectIds = (myAssignments || []).map(a => a.project_id)
                }
            }

            let query = supabase
                .from('projects')
                .select(`
                    *,
                    creator:profiles!projects_created_by_fkey(full_name),
                    categories:project_categories(id, is_completed)
                `)
                .order('created_at', { ascending: false })

            if (projectIds !== null) {
                if (projectIds.length === 0) {
                    setProjects([])
                    setLoading(false)
                    return
                }
                query = query.in('id', projectIds)
            }

            const { data: projectsData, error } = await query
            if (error) throw error

            // Assignmentları ekle
            const projectsWithAssignments = await Promise.all(
                (projectsData || []).map(async (proj) => {
                    const { data: assignments } = await supabase
                        .from('project_assignments')
                        .select('profiles(id, full_name, unit)')
                        .eq('project_id', proj.id)
                    return { ...proj, assignments: assignments || [] }
                })
            )
            setProjects(projectsWithAssignments)
        } catch (error) {
            console.error('Projeler yüklenemedi:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleDeleteProject(e, projId) {
        e.preventDefault()
        e.stopPropagation()
        if (!window.confirm('Bu projeyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) return
        try {
            // Cascade: categories, assignments, step_entries silinecek (DB constraint varsa otomatik, yoksa manuel)
            await supabase.from('project_step_entries').delete().in('category_id',
                (await supabase.from('project_categories').select('id').eq('project_id', projId)).data?.map(c => c.id) || []
            )
            await supabase.from('project_categories').delete().eq('project_id', projId)
            await supabase.from('project_assignments').delete().eq('project_id', projId)
            const { error } = await supabase.from('projects').delete().eq('id', projId)
            if (error) throw error
            fetchProjects()
        } catch (err) {
            alert('Proje silinemedi: ' + err.message)
        }
    }

    async function handleSaveProject(e) {
        e.preventDefault()
        try {
            if (editingProject) {
                // Update project
                const { error: projError } = await supabase.from('projects').update({
                    name: newProject.name,
                    code: newProject.code,
                    description: newProject.description,
                    start_date: newProject.start_date || null,
                    due_date: newProject.due_date || null
                }).eq('id', editingProject)

                if (projError) throw projError

                // Update assignments: delete old, insert new
                await supabase.from('project_assignments').delete().eq('project_id', editingProject)

                if (newProject.assignedUsers.length > 0) {
                    const assignments = newProject.assignedUsers.map(uid => ({
                        project_id: editingProject,
                        user_id: uid
                    }))
                    await supabase.from('project_assignments').insert(assignments)
                }

                // Add missing categories
                const { data: existingCats } = await supabase.from('project_categories').select('main_category').eq('project_id', editingProject)
                const existingSet = new Set((existingCats || []).map(c => c.main_category))

                const categoriesToInsert = []
                if (newProject.categories.pano && !existingSet.has('1- Pano Yapımı')) {
                    const steps = ['Pano Mekanik', 'Etiketleme / Numaralandırma', 'İç Bağlantı Kontrolü', 'Atölye Pano Testi', 'Proje Çizimi Kontrolü']
                    steps.forEach(sub => categoriesToInsert.push({ project_id: editingProject, main_category: '1- Pano Yapımı', sub_category: sub }))
                }
                if (newProject.categories.yazilim && !existingSet.has('2- Yazılım')) {
                    categoriesToInsert.push({ project_id: editingProject, main_category: '2- Yazılım', sub_category: 'Yazılım' })
                }
                if (newProject.categories.saha && !existingSet.has('3- Saha Kurulum')) {
                    const steps = ['Pano Sahaya Sevk', 'Saha Kablolama', 'Enerji Verme ve I/O Testi', 'Yazılım Testi', 'Test Çalıştırması', 'Son Kullanıcı Sevk Söküm']
                    steps.forEach(sub => categoriesToInsert.push({ project_id: editingProject, main_category: '3- Saha Kurulum', sub_category: sub }))
                }
                if (newProject.categories.test && !existingSet.has('4- Son Kullanıcı Test, Devreye Alma')) {
                    const steps = ['Saha Kablolama', 'Enerji Verme I/O Kontrolü', 'Yazılım Testi', 'Test Çalıştırması', 'Teslim Çalıştırması']
                    steps.forEach(sub => categoriesToInsert.push({ project_id: editingProject, main_category: '4- Son Kullanıcı Test, Devreye Alma', sub_category: sub }))
                }

                if (categoriesToInsert.length > 0) {
                    const { error: catError } = await supabase.from('project_categories').insert(categoriesToInsert)
                    if (catError) throw catError
                }

            } else {
                // 1. Proje oluştur
                const { data: projectData, error: projError } = await supabase.from('projects').insert([{
                    name: newProject.name,
                    code: newProject.code,
                    description: newProject.description,
                    start_date: newProject.start_date || null,
                    due_date: newProject.due_date || null,
                    created_by: user.id
                }]).select().single()

                if (projError) throw projError

                const projectId = projectData.id

                // 2. Kişileri ata
                if (newProject.assignedUsers.length > 0) {
                    const assignments = newProject.assignedUsers.map(uid => ({
                        project_id: projectId,
                        user_id: uid
                    }))
                    await supabase.from('project_assignments').insert(assignments)
                } else {
                    // Kendini ata
                    await supabase.from('project_assignments').insert([{ project_id: projectId, user_id: user.id }])
                }

                // 3. Kategorileri ve Şablonları oluştur
                const categoriesToInsert = []

                if (newProject.categories.pano) {
                    const steps = ['Pano Mekanik', 'Etiketleme / Numaralandırma', 'İç Bağlantı Kontrolü', 'Atölye Pano Testi', 'Proje Çizimi Kontrolü']
                    steps.forEach(sub => {
                        categoriesToInsert.push({ project_id: projectId, main_category: '1- Pano Yapımı', sub_category: sub })
                    })
                }
                if (newProject.categories.yazilim) {
                    categoriesToInsert.push({ project_id: projectId, main_category: '2- Yazılım', sub_category: 'Yazılım' })
                }
                if (newProject.categories.saha) {
                    const steps = ['Pano Sahaya Sevk', 'Saha Kablolama', 'Enerji Verme ve I/O Testi', 'Yazılım Testi', 'Test Çalıştırması', 'Son Kullanıcı Sevk Söküm']
                    steps.forEach(sub => {
                        categoriesToInsert.push({ project_id: projectId, main_category: '3- Saha Kurulum', sub_category: sub })
                    })
                }
                if (newProject.categories.test) {
                    const steps = ['Saha Kablolama', 'Enerji Verme I/O Kontrolü', 'Yazılım Testi', 'Test Çalıştırması', 'Teslim Çalıştırması']
                    steps.forEach(sub => {
                        categoriesToInsert.push({ project_id: projectId, main_category: '4- Son Kullanıcı Test, Devreye Alma', sub_category: sub })
                    })
                }

                if (categoriesToInsert.length > 0) {
                    const { error: catError } = await supabase.from('project_categories').insert(categoriesToInsert)
                    if (catError) throw catError
                }
            }

            setShowModal(false)
            setEditingProject(null)
            setNewProject({
                name: '', code: '', description: '', start_date: '', due_date: '', assignedUsers: [],
                categories: { pano: false, yazilim: false, saha: false, test: false }
            })
            fetchProjects()
        } catch (error) {
            alert('Proje oluşturulurken hata: ' + error.message)
        }
    }

    const isAuthorized = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'unit_manager' || profile?.role === 'manager'
    const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'manager'

    // Üst yetkili kullanıcılar için projeleri birime göre grupla
    const projectsByUnit = isSuperAdmin ? projects.reduce((acc, proj) => {
        // Projedeki herkesi topla, birimlerini çıkar
        const units = [...new Set((proj.assignments || []).map(a => a.profiles?.unit).filter(Boolean))]
        const unitLabel = units.length > 0 ? units.join(' / ') : 'Birims\u0131z'
        if (!acc[unitLabel]) acc[unitLabel] = []
        acc[unitLabel].push(proj)
        return acc
    }, {}) : null

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
                <header className="h-20 px-8 flex items-center justify-between bg-white border-b border-slate-200 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Projeler</h2>
                        <p className="text-slate-500 text-sm">Tüm aktif projelerinizi buradan yönetebilirsiniz.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {isAuthorized && (
                            <button
                                onClick={() => {
                                    setEditingProject(null)
                                    setNewProject({
                                        name: '', code: '', description: '', start_date: '', due_date: '', assignedUsers: [],
                                        categories: { pano: false, yazilim: false, saha: false, test: false }
                                    })
                                    setShowModal(true)
                                }}
                                className="flex items-center gap-2 bg-[#137fec] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95"
                            >
                                <span className="material-symbols-outlined text-lg">add</span>
                                <span>Yeni Proje Oluştur</span>
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    {loading ? (
                        <div className="text-center py-12 text-slate-500">Yükleniyor...</div>
                    ) : projects.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-slate-200">
                            <div className="text-6xl mb-4">📂</div>
                            <h3 className="text-xl font-semibold text-slate-700 mb-2">Henüz proje yok</h3>
                            <p className="text-slate-500 mb-4">Yeni bir proje oluşturarak başlayın.</p>
                        </div>
                    ) : isSuperAdmin && projectsByUnit ? (
                        // Birim bazlı gruplu görünüm (Admin/Manager/Super Admin)
                        <div className="space-y-10">
                            {Object.entries(projectsByUnit).sort(([a], [b]) => a.localeCompare(b, 'tr')).map(([unit, unitProjects]) => (
                                <div key={unit}>
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-indigo-500 text-[20px]">apartment</span>
                                            <h3 className="text-base font-black text-slate-700 uppercase tracking-widest">{unit}</h3>
                                        </div>
                                        <div className="flex-1 h-px bg-slate-200"></div>
                                        <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{unitProjects.length} Proje</span>
                                    </div>
                                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                        {unitProjects.map(proj => {
                                            const totalCats = proj.categories?.length || 0;
                                            const completedCats = proj.categories?.filter(c => c.is_completed).length || 0;
                                            const pct = totalCats === 0 ? 0 : Math.round((completedCats / totalCats) * 100);
                                            return (
                                                <Link key={proj.id} to={`/projects/${proj.id}`} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-200 transition-all group">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="flex items-center justify-between w-full">
                                                            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">{proj.code || 'KOD-YOK'}</span>
                                                            {isAuthorized && (
                                                                <button onClick={async (e) => {
                                                                    e.preventDefault(); e.stopPropagation();
                                                                    const { data: ecats } = await supabase.from('project_categories').select('main_category').eq('project_id', proj.id)
                                                                    const ecatSet = new Set((ecats || []).map(c => c.main_category))
                                                                    setEditingProject(proj.id)
                                                                    setNewProject({ name: proj.name, code: proj.code || '', description: proj.description || '', start_date: proj.start_date ? proj.start_date.split('T')[0] : '', due_date: proj.due_date ? proj.due_date.split('T')[0] : '', assignedUsers: proj.assignments?.map(a => a.profiles.id) || [], categories: { pano: ecatSet.has('1- Pano Yapımı'), yazilim: ecatSet.has('2- Yazılım'), saha: ecatSet.has('3- Saha Kurulum'), test: ecatSet.has('4- Son Kullanıcı Test, Devreye Alma') } })
                                                                    setShowModal(true)
                                                                }} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition-colors border border-transparent hover:border-indigo-100" title="Projeyi Düzenle">✎</button>
                                                            )}
                                                            {isAuthorized && (
                                                                <button onClick={(e) => handleDeleteProject(e, proj.id)} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors border border-transparent hover:border-red-100" title="Projeyi Sil">
                                                                    🗑️
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">{proj.name}</h3>
                                                    <p className="text-slate-600 text-sm mb-4 line-clamp-2">{proj.description || 'Açıklama bulunmuyor.'}</p>
                                                    <div className="mb-4">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">İlerleme</span>
                                                            <span className="text-[10px] font-bold text-indigo-600">%{pct}</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                            <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                                                        </div>
                                                    </div>
                                                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                                            {proj.due_date ? new Date(proj.due_date).toLocaleDateString('tr-TR') : 'Belirtilmedi'}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[16px]">group</span>
                                                            {proj.assignments?.length} Kişi
                                                        </div>
                                                    </div>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        // Standart / Birim Amiri görünümü (düz grid)
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {projects.map(proj => {
                                const totalCats = proj.categories?.length || 0;
                                const completedCats = proj.categories?.filter(c => c.is_completed).length || 0;
                                const pct = totalCats === 0 ? 0 : Math.round((completedCats / totalCats) * 100);

                                return (
                                    <Link
                                        key={proj.id}
                                        to={`/projects/${proj.id}`}
                                        className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-200 transition-all group"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center justify-between w-full">
                                                <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                                                    {proj.code || 'KOD-YOK'}
                                                </span>
                                                {isAuthorized && (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.preventDefault()
                                                            e.stopPropagation()

                                                            const { data: ecats } = await supabase.from('project_categories').select('main_category').eq('project_id', proj.id)
                                                            const ecatSet = new Set((ecats || []).map(c => c.main_category))

                                                            setEditingProject(proj.id)
                                                            setNewProject({
                                                                name: proj.name,
                                                                code: proj.code || '',
                                                                description: proj.description || '',
                                                                start_date: proj.start_date ? proj.start_date.split('T')[0] : '',
                                                                due_date: proj.due_date ? proj.due_date.split('T')[0] : '',
                                                                assignedUsers: proj.assignments?.map(a => a.profiles.id) || [],
                                                                categories: {
                                                                    pano: ecatSet.has('1- Pano Yapımı'),
                                                                    yazilim: ecatSet.has('2- Yazılım'),
                                                                    saha: ecatSet.has('3- Saha Kurulum'),
                                                                    test: ecatSet.has('4- Son Kullanıcı Test, Devreye Alma')
                                                                }
                                                            })
                                                            setShowModal(true)
                                                        }}
                                                        className="w-8 h-8 rounded-full bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition-colors border border-transparent hover:border-indigo-100"
                                                        title="Projeyi Düzenle"
                                                    >
                                                        ✎
                                                    </button>
                                                )}
                                                {isAuthorized && (
                                                    <button
                                                        onClick={(e) => handleDeleteProject(e, proj.id)}
                                                        className="w-8 h-8 rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors border border-transparent hover:border-red-100"
                                                        title="Projeyi Sil"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">
                                            {proj.name}
                                        </h3>
                                        <p className="text-slate-600 text-sm mb-4 line-clamp-2">
                                            {proj.description || 'Açıklama bulunmuyor.'}
                                        </p>

                                        <div className="mb-4">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">İlerleme</span>
                                                <span className="text-[10px] font-bold text-indigo-600">%{pct}</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                            <div className="flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                                {proj.due_date ? new Date(proj.due_date).toLocaleDateString('tr-TR') : 'Belirtilmedi'}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px]">group</span>
                                                {proj.assignments?.length} Kişi
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Yeni Proje Ekle Modalı */}
                {showModal && isAuthorized && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                                <h3 className="text-lg font-bold text-slate-800">Yeni Proje Başlat</h3>
                                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                <form id="project-form" onSubmit={handleSaveProject} className="space-y-5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2 sm:col-span-1">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Proje Adı *</label>
                                            <input required type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900" placeholder="Örn: Yeni Fabrika Otomasyonu" value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} />
                                        </div>
                                        <div className="col-span-2 sm:col-span-1">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Proje Kodu</label>
                                            <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900" placeholder="Örn: PRJ-2026" value={newProject.code} onChange={e => setNewProject({ ...newProject, code: e.target.value })} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Açıklama</label>
                                        <textarea className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none text-slate-900" placeholder="Projenin amacı ve detayları..." value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Başlangıç Tarihi</label>
                                            <input type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900" value={newProject.start_date} onChange={e => setNewProject({ ...newProject, start_date: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Teslim Tarihi</label>
                                            <input type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900" value={newProject.due_date} onChange={e => setNewProject({ ...newProject, due_date: e.target.value })} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-3 border-b pb-2">Proje Modülleri (Kategoriler)</label>
                                        <div className="space-y-3">
                                            <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                                                <input type="checkbox" checked={newProject.categories.pano} onChange={e => setNewProject({ ...newProject, categories: { ...newProject.categories, pano: e.target.checked } })} className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                                <div>
                                                    <span className="block font-semibold text-slate-800">1- Pano Yapımı</span>
                                                    <span className="text-xs text-slate-500">Mekanik, etiketleme, iç bağlantı, pano testi onayları içerir.</span>
                                                </div>
                                            </label>
                                            <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                                                <input type="checkbox" checked={newProject.categories.yazilim} onChange={e => setNewProject({ ...newProject, categories: { ...newProject.categories, yazilim: e.target.checked } })} className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                                <div>
                                                    <span className="block font-semibold text-slate-800">2- Yazılım</span>
                                                    <span className="text-xs text-slate-500">Yazılım süreçlerini yönetmeniz için alan açar.</span>
                                                </div>
                                            </label>
                                            <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                                                <input type="checkbox" checked={newProject.categories.saha} onChange={e => setNewProject({ ...newProject, categories: { ...newProject.categories, saha: e.target.checked } })} className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                                <div>
                                                    <span className="block font-semibold text-slate-800">3- Saha Kurulum</span>
                                                    <span className="text-xs text-slate-500">Kablolama, I/O testi, son kullanıcı sevk söküm gibi adım şablonlarını içerir.</span>
                                                </div>
                                            </label>
                                            <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                                                <input type="checkbox" checked={newProject.categories.test} onChange={e => setNewProject({ ...newProject, categories: { ...newProject.categories, test: e.target.checked } })} className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                                <div>
                                                    <span className="block font-semibold text-slate-800">4- Son kullanıcı test, devreye alma</span>
                                                    <span className="text-xs text-slate-500">Saha kablolama, teslim ve devreye alma adımlarını barındırır.</span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Proje Ekibi (Atanan Kişiler)</label>
                                        <div className="max-h-32 overflow-y-auto border border-slate-300 rounded-lg p-3 space-y-2 bg-slate-50">
                                            {availableUsers.map(u => (
                                                <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-200 rounded cursor-pointer">
                                                    <input type="checkbox" checked={newProject.assignedUsers.includes(u.id)} onChange={e => {
                                                        const isChecked = e.target.checked
                                                        setNewProject(prev => ({
                                                            ...prev,
                                                            assignedUsers: isChecked ? [...prev.assignedUsers, u.id] : prev.assignedUsers.filter(id => id !== u.id)
                                                        }))
                                                    }} className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" />
                                                    <span className="text-sm text-slate-700 font-medium">{u.full_name || u.username} <span className="text-xs text-slate-500 font-normal">({u.unit})</span></span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </form>
                            </div>

                            <div className="p-4 border-t border-slate-100 bg-white shrink-0 flex gap-3 justify-end">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors">İptal</button>
                                <button type="submit" form="project-form" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-md shadow-indigo-500/20 transition-all">{editingProject ? 'Projeyi Güncelle' : 'Projeyi Başlat 🚀'}</button>
                            </div>

                        </div>
                    </div>
                )}

            </main>
        </div>
    )
}
