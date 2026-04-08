

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

export default function Dashboard() {
    const { user, signOut } = useAuth()
    const navigate = useNavigate()
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'normal', category: 'Yeni Proje', start_date: '', due_date: '' })
    const [editingTask, setEditingTask] = useState(null) // Düzenleme için

    // Yorum sistemi için
    const [expandedTask, setExpandedTask] = useState(null) // Hangi görevin yorumları açık
    const [comments, setComments] = useState([]) // Yorumları tutan liste
    const [newComment, setNewComment] = useState('') // Yeni yorum input
    const [loadingComments, setLoadingComments] = useState(false)

    // Filtreleme sistemi
    const [filters, setFilters] = useState({
        priority: 'all',    // 'all', 'acil', 'normal', 'düşük'
        assignment: 'all',  // 'all', 'assigned_to_me', 'created_by_me'
        status: 'all',      // 'all', 'completed', 'in_progress', 'pending'
        category: 'all'     // 'all', 'Yeni Proje', 'Arıza', 'Revizyon', 'Diğer'
    })

    // Gelişmiş Filtreleme (Client-Side)
    const [searchTerm, setSearchTerm] = useState('')
    const [dateRange, setDateRange] = useState({ start: '', end: '' })

    // Silme onay modalı
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [taskToDelete, setTaskToDelete] = useState(null)

    // Gruplandırma için (super_admin) - Başlangıçta tüm gruplar kapalı
    const [collapsedGroups, setCollapsedGroups] = useState({
        'Yönetim': true,
        'Vision & Software': true,
        'Atölye': true,
        'Otomasyon': true,
        'Mekanik': true,
        'Satış & Pazarlama': true
    })

    // Profil bilgisini çek
    const [profile, setProfile] = useState(null)

    // Takvim için
    const [selectedDate, setSelectedDate] = useState(null) // Seçili tarih (null = tüm görevler)
    const [weekStart, setWeekStart] = useState(() => {
        const today = new Date()
        const day = today.getDay()
        const diff = today.getDate() - day + (day === 0 ? -6 : 1) // Pazartesi
        return new Date(today.setDate(diff))
    })

    // Haftalık günleri hesapla
    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart)
        date.setDate(weekStart.getDate() + i)
        return date
    })



    const [availableUsers, setAvailableUsers] = useState([])

    useEffect(() => {
        if (user) {
            fetchProfile()
            fetchTasks()
            fetchUsers()
        }
    }, [user])

    async function fetchUsers() {
        if (!user) return

        // Rol kontrolü: Sadece admin ve manager görebilir
        // Ancak bu kontrolü burada yapmak yerine UI'da gizlemek ve backend RLS'ine güvenmek daha iyi
        // Şimdilik basitçe hepsini çekelim, RLS zaten filtreleyecek (veya public ise hepsi gelecek)

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, username, role, unit')
            .neq('username', 'super_admin') // Super admin'i listede gösterme

        if (!error && data) {
            // Eğer unit_manager ise sadece kendi birimindekileri filtrele (Client-side filtreleme ek güvenlik)
            // Profil yüklendikten sonra filtrelemek daha doğru olur ama şimdilik data'yı state'e alalım
            setAvailableUsers(data)
        }
    }

    async function fetchProfile() {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
        setProfile(data)
    }

    async function fetchTasks() {
        console.log('🔍 fetchTasks başladı...')
        try {
            console.log('📡 Supabase sorgusu gönderiliyor...')

            // ÖNCE sadece tasks'ı çek (RLS bypass için join yok)
            const { data: tasksData, error: tasksError } = await supabase
                .from('tasks')
                .select(`
          *,
          creator:created_by(full_name, username, unit)
        `)
                .order('created_at', { ascending: false })

            if (tasksError) {
                console.error('❌ Tasks hatası:', tasksError)
                throw tasksError
            }

            console.log('✅ Tasks alındı:', tasksData?.length || 0, 'adet')

            // SONRA her task için assignments'ı çek (RPC ile - RLS bypass)
            const tasksWithAssignments = await Promise.all(
                (tasksData || []).map(async (task) => {
                    try {
                        const { data: assignments, error } = await supabase
                            .rpc('get_task_assignees', { target_task_id: task.id })

                        if (error) {
                            console.warn(`⚠️ Task ${task.id} assignments yüklenemedi:`, error.message)
                            return {
                                ...task,
                                assignments: [],
                                steps: []
                            }
                        }

                        // assignments verisini uyumlu formata çevir (user objesi içinde gösterim için)
                        const formattedAssignments = (assignments || []).map(a => ({
                            user: {
                                id: a.user_id,
                                full_name: a.full_name,
                                username: a.username
                            }
                        }))

                        return {
                            ...task,
                            assignments: formattedAssignments,
                            steps: []
                        }
                    } catch (err) {
                        console.warn(`⚠️ Task ${task.id} için beklenmeyen hata:`, err)
                        return {
                            ...task,
                            assignments: [],
                            steps: []
                        }
                    }
                })
            )

            console.log('✅ Assignments ile görevler hazır:', tasksWithAssignments.length)
            setTasks(tasksWithAssignments)
        } catch (error) {
            console.error('💥 Görevler yüklenirken hata:', error.message)
            console.error('💥 Tam hata:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSaveTask(e) {
        e.preventDefault()
        try {
            // Seçili kullanıcılar veya kendisi (default)
            const selectedUserIds = newTask.assignedUsers && newTask.assignedUsers.length > 0
                ? newTask.assignedUsers
                : [user.id]

            if (editingTask) {
                // GÜNCELLEME İŞLEMİ
                const { error } = await supabase
                    .from('tasks')
                    .update({
                        title: newTask.title,
                        description: newTask.description,
                        priority: newTask.priority,
                        category: newTask.category,
                        start_date: newTask.start_date || null,
                        due_date: newTask.due_date || null,
                        assigned_to: selectedUserIds[0] // Hybrid RLS için ilk kullanıcı
                    })
                    .eq('id', editingTask.id)

                if (error) throw error

                // Atamaları Güncelle: Önce sil (RPC ile), sonra ekle (RPC ile)
                // 1. Önce eski atamaları temizle
                await supabase.rpc('delete_task_assignments', { target_task_id: editingTask.id })

                // 2. Yeni atamaları tek tek ekle
                for (const uid of selectedUserIds) {
                    await supabase.rpc('assign_task_user', {
                        target_task_id: editingTask.id,
                        target_user_id: uid
                    })
                }

            } else {
                // YENİ EKLEME İŞLEMİ
                const { data: taskData, error } = await supabase.from('tasks').insert([
                    {
                        title: newTask.title,
                        description: newTask.description,
                        priority: newTask.priority,
                        category: newTask.category,
                        start_date: newTask.start_date || null,
                        due_date: newTask.due_date || null,
                        assigned_to: selectedUserIds[0],
                        created_by: user.id
                    }
                ]).select().single()

                if (error) throw error

                const taskId = taskData.id

                // task_assignments tablosuna ekle (RPC ile)
                for (const uid of selectedUserIds) {
                    await supabase.rpc('assign_task_user', {
                        target_task_id: taskId,
                        target_user_id: uid
                    })
                }
            }


            setShowModal(false)
            setEditingTask(null)
            setNewTask({ title: '', description: '', priority: 'normal', category: 'Yeni Proje', start_date: '', due_date: '', assignedUsers: [] })
            await fetchTasks() // await ekledik - görevler yüklenene kadar bekle
        } catch (error) {
            alert('Hata: ' + error.message)
        }
    }

    async function handleStatusChange(taskId, newStatus) {
        try {
            // Eğer görev "completed" iken "pending"e çevriliyorsa (yani tamamlandı ✓ kaldırılıyorsa)
            // önce görev adımlarını kontrol et
            if (newStatus === 'pending') {
                const { data: steps, error: stepsError } = await supabase
                    .from('task_steps')
                    .select('id')
                    .eq('task_id', taskId)

                if (stepsError) {
                    console.error('Görev adımları kontrol edilemedi:', stepsError)
                } else if (steps && steps.length > 0) {
                    // Eğer görev adımları varsa, durumu "in_progress" yap
                    newStatus = 'in_progress'
                }
            }

            const { error } = await supabase
                .from('tasks')
                .update({ status: newStatus })
                .eq('id', taskId)

            if (error) throw error
            fetchTasks()
        } catch (error) {
            console.error('Durum güncellenemedi:', error)
        }
    }

    async function deleteTask() {
        if (!taskToDelete) return

        try {
            const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskToDelete.id)

            if (error) throw error

            setShowDeleteModal(false)
            setTaskToDelete(null)
            await fetchTasks()
        } catch (error) {
            console.error('Görev silinemedi:', error)
            alert('Görev silinirken bir hata oluştu: ' + error.message)
        }
    }

    function handleDeleteClick(task) {
        setTaskToDelete(task)
        setShowDeleteModal(true)
    }


    // ====== YORUM FONKSİYONLARI ======
    async function toggleComments(taskId) {
        if (expandedTask === taskId) {
            // Kapatma
            setExpandedTask(null)
            setComments([])
        } else {
            // Açma + yorumları çek
            setExpandedTask(taskId)
            await fetchComments(taskId)
        }
    }

    async function fetchComments(taskId) {
        setLoadingComments(true)
        try {
            const { data, error } = await supabase
                .from('comments')
                .select(`
                    *,
                    author:profiles!comments_user_id_fkey(full_name, username)
                `)
                .eq('task_id', taskId)
                .order('created_at', { ascending: true })

            if (error) throw error
            setComments(data || [])
        } catch (error) {
            console.error('Yorumlar yüklenemedi:', error)
        } finally {
            setLoadingComments(false)
        }
    }

    async function handleAddComment(taskId) {
        if (!newComment.trim()) return

        try {
            const { error } = await supabase
                .from('comments')
                .insert([{
                    task_id: taskId,
                    user_id: user.id,
                    content: newComment.trim()
                }])

            if (error) throw error

            setNewComment('')
            await fetchComments(taskId) // Listeyi yenile
        } catch (error) {
            alert('Yorum eklenemedi: ' + error.message)
        }
    }

    async function handleDeleteComment(commentId, taskId) {
        if (!confirm('Bu yorumu silmek istediğinize emin misiniz?')) return

        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId)

            if (error) throw error

            await fetchComments(taskId) // Listeyi yenile
        } catch (error) {
            alert('Yorum silinemedi: ' + error.message)
        }
    }

    const clearFilters = () => {
        setFilters({
            priority: 'all',
            assignment: 'all',
            status: 'all',
            category: 'all'
        })
        setSearchTerm('')
        setDateRange({ start: '', end: '' })
        setSelectedDate(null)
    }

    // Filtrelenmiş görevler
    const filteredTasks = tasks.filter(task => {
        // Metin arama (Başlık ve Açıklama)
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase()
            const titleMatch = task.title?.toLowerCase().includes(searchLower)
            const descMatch = task.description?.toLowerCase().includes(searchLower)
            if (!titleMatch && !descMatch) return false
        }

        // Tarih aralığı filtresi
        if (dateRange.start && task.due_date) {
            if (new Date(task.due_date) < new Date(dateRange.start)) return false
        }
        if (dateRange.end && task.due_date) {
            const endDate = new Date(dateRange.end)
            endDate.setHours(23, 59, 59, 999)
            if (new Date(task.due_date) > endDate) return false
        }

        // Öncelik filtresi
        if (filters.priority !== 'all' && task.priority !== filters.priority) return false

        // Kategori (Görev Türü) filtresi
        if (filters.category !== 'all' && task.category !== filters.category) return false

        // Atama filtresi
        if (filters.assignment === 'assigned_to_me' && task.assigned_to !== user.id) return false
        if (filters.assignment === 'created_by_me' && task.created_by !== user.id) return false

        // Durum filtresi
        if (filters.status !== 'all' && task.status !== filters.status) return false

        // Tarih filtresi (Takvimden seçilen gün)
        if (selectedDate && task.due_date) {
            const taskDate = new Date(task.due_date).toDateString()
            const selected = selectedDate.toDateString()
            if (taskDate !== selected) return false
        }

        return true
    })

    // Birimlere göre gruplandırma (super_admin için)
    function groupTasksByUnit(tasksToGroup) {
        const units = ['Yönetim', 'Vision & Software', 'Atölye', 'Otomasyon', 'Mekanik', 'Satış & Pazarlama']
        const groups = {}

        units.forEach(unit => {
            groups[unit] = tasksToGroup.filter(task => task.creator?.unit === unit)
        })

        return groups
    }

    const groupedTasks = profile?.role === 'super_admin' ? groupTasksByUnit(filteredTasks) : null

    function toggleGroup(unit) {
        setCollapsedGroups(prev => ({
            ...prev,
            [unit]: !prev[unit]
        }))
    }

    function getUnitIcon(unit) {
        const icons = {
            'Yönetim': '🏢',
            'Vision & Software': '👁️',
            'Atölye': '🔧',
            'Otomasyon': '⚙️',
            'Mekanik': '🔩',
            'Satış & Pazarlama': '📊'
        }
        return icons[unit] || '📁'
    }

    // Tarihe göre görevleri grupla (takvim için)
    const getTasksForDate = (date) => {
        return tasks.filter(task => {
            if (!task.due_date) return false
            return new Date(task.due_date).toDateString() === date.toDateString()
        })
    }

    // Hafta navigas yonu
    const goToPreviousWeek = () => {
        const newStart = new Date(weekStart)
        newStart.setDate(weekStart.getDate() - 7)
        setWeekStart(newStart)
    }

    const goToNextWeek = () => {
        const newStart = new Date(weekStart)
        newStart.setDate(weekStart.getDate() + 7)
        setWeekStart(newStart)
    }


    // İstatistikler (Sadece admin için)
    const stats = profile?.role === 'admin' ? {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        urgent: tasks.filter(t => t.priority === 'acil').length,
        completionRate: tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0
    } : null

    // En aktif kullanıcılar (Sadece admin için)
    const userPerformance = profile?.role === 'admin' && tasks.length > 0 ? (() => {
        const userStats = {}
        tasks.forEach(task => {
            if (task.status === 'completed' && task.assignee) {
                const name = task.assignee.full_name || task.assignee.username || 'Bilinmiyor'
                userStats[name] = (userStats[name] || 0) + 1
            }
        })
        return Object.entries(userStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5) // En aktif 5 kişi
    })() : null

    return (
        <div className="bg-[#101922] text-white font-['Inter'] overflow-hidden h-screen flex w-full">
            {/* Sidebar */}
            <aside className="flex flex-col w-64 h-full bg-[#101922] border-r border-[#233648] shrink-0 transition-all duration-300">
                {/* Logo Area */}
                <div className="p-6 flex items-center gap-3">
                    <img src="/assets/seca-logo.png" alt="SECA" className="h-8 w-auto" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                    <div className="hidden size-8 bg-[#137fec] rounded-lg items-center justify-center text-white">
                        <span className="material-symbols-outlined text-xl">dataset</span>
                    </div>
                    <h1 className="text-white text-lg font-bold tracking-tight">SecaTask</h1>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 flex flex-col gap-2 mt-4">
                    <a
                        href="#"
                        className="flex items-center gap-3 px-3 py-3 rounded-lg bg-[#137fec] text-white shadow-lg shadow-[#137fec]/20 group"
                    >
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>dashboard</span>
                        <span className="text-sm font-medium">Dashboard</span>
                    </a>
                    <a
                        href="#"
                        className="flex items-center gap-3 px-3 py-3 rounded-lg text-[#92adc9] hover:bg-[#233648] hover:text-white transition-colors group"
                    >
                        <span className="material-symbols-outlined">check_circle</span>
                        <span className="text-sm font-medium">My Tasks</span>
                    </a>
                    
                    <Link
                        to="/projects"
                        className="flex items-center gap-3 px-3 py-3 rounded-lg text-[#92adc9] hover:bg-[#233648] hover:text-white transition-colors group"
                    >
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                        <span className="text-sm font-medium">Projeler</span>
                    </Link>

                    {/* Team Stats - Only for unit_manager and super_admin */}
                    {(profile?.role === 'unit_manager' || profile?.role === 'super_admin') && (
                        <Link
                            to="/team-stats"
                            className="flex items-center gap-3 px-3 py-3 rounded-lg text-[#92adc9] hover:bg-[#233648] hover:text-white transition-colors group"
                        >
                            <span className="material-symbols-outlined">groups</span>
                            <span className="text-sm font-medium">Team Stats</span>
                        </Link>
                    )}

                    <a
                        href="#"
                        className="flex items-center gap-3 px-3 py-3 rounded-lg text-[#92adc9] hover:bg-[#233648] hover:text-white transition-colors group"
                    >
                        <span className="material-symbols-outlined">settings</span>
                        <span className="text-sm font-medium">Settings</span>
                    </a>
                </nav>

                {/* User Profile (Bottom) */}
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
                        <button
                            onClick={signOut}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Çıkış Yap"
                        >
                            <span className="material-symbols-outlined text-[#92adc9] text-sm hover:text-red-400">logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full bg-[#f6f7f8] overflow-hidden relative">
                {/* Header */}
                <header className="h-20 px-8 flex items-center justify-between bg-white border-b border-slate-200 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">
                            {profile?.role === 'admin' ? 'Admin Dashboard' : 'Görevlerim'}
                        </h2>
                        <p className="text-slate-500 text-sm">
                            Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}. You have {tasks.filter(t => t.status === 'pending').length} pending tasks.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Search */}
                        <div className="relative hidden md:block">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                            <input
                                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-[#137fec]/50 text-slate-700 placeholder-slate-400 outline-none"
                                placeholder="Search tasks..."
                                type="text"
                            />
                        </div>
                        {/* Notifications */}
                        <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>
                        {/* New Task Button */}
                        <button
                            onClick={() => {
                                setNewTask({ title: '', description: '', priority: 'normal', category: 'Yeni Proje', start_date: '', due_date: '' })
                                setEditingTask(null)
                                setShowModal(true)
                            }}
                            className="flex items-center gap-2 bg-[#137fec] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95"
                        >
                            <span className="material-symbols-outlined text-lg">add</span>
                            <span>New Task</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {/* İstatistik Paneli (Sadece Admin) */}
                    {profile?.role === 'admin' && stats && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <span>📊</span> Birim İstatistikleri
                            </h3>

                            {/* Stat Kartları */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                {/* Toplam Görev */}
                                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-5 text-white shadow-lg">
                                    <div className="text-3xl mb-1">📋</div>
                                    <div className="text-2xl font-bold mb-1">{stats.total}</div>
                                    <div className="text-sm opacity-90">Toplam Görev</div>
                                </div>

                                {/* Tamamlandı */}
                                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white shadow-lg">
                                    <div className="text-3xl mb-1">✅</div>
                                    <div className="text-2xl font-bold mb-1">{stats.completed}</div>
                                    <div className="text-sm opacity-90">Tamamlandı ({stats.completionRate}%)</div>
                                </div>

                                {/* Beklemede */}
                                <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-5 text-white shadow-lg">
                                    <div className="text-3xl mb-1">⏳</div>
                                    <div className="text-2xl font-bold mb-1">{stats.pending}</div>
                                    <div className="text-sm opacity-90">Beklemede</div>
                                </div>

                                {/* Acil */}
                                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-5 text-white shadow-lg">
                                    <div className="text-3xl mb-1">🔴</div>
                                    <div className="text-2xl font-bold mb-1">{stats.urgent}</div>
                                    <div className="text-sm opacity-90">Acil Görev</div>
                                </div>
                            </div>

                            {/* En Aktif Kullanıcılar */}
                            {userPerformance && userPerformance.length > 0 && (
                                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                                    <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                        <span>👥</span> En Aktif Kullanıcılar (Tamamlanan Görevlere Göre)
                                    </h4>
                                    <div className="space-y-2">
                                        {userPerformance.map(([name, count], index) => (
                                            <div key={name} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-lg font-bold text-slate-400">#{index + 1}</span>
                                                    <span className="font-medium text-slate-700">{name}</span>
                                                </div>
                                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                                                    ✅ {count} görev
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* İstatistik Pasta Grafiği - Recharts */}
                    <div className="bg-gradient-to-br from-white to-slate-50 rounded-xl shadow-sm border-2 border-slate-200 p-6 mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                            <span>📊</span> Görev Durumu Dağılımı
                        </h3>

                        {(() => {
                            const completed = filteredTasks.filter(t => t.status === 'completed').length
                            const inProgress = filteredTasks.filter(t => t.status === 'in_progress').length
                            const pending = filteredTasks.filter(t => t.status === 'pending').length
                            const total = filteredTasks.length

                            const chartData = [
                                { name: 'Tamamlandı', value: completed, color: '#10b981' },
                                { name: 'Devam Ediyor', value: inProgress, color: '#3b82f6' },
                                { name: 'Beklemede', value: pending, color: '#eab308' }
                            ].filter(item => item.value > 0)

                            const completedPercent = total > 0 ? Math.round((completed / total) * 100) : 0
                            const inProgressPercent = total > 0 ? Math.round((inProgress / total) * 100) : 0
                            const pendingPercent = total > 0 ? Math.round((pending / total) * 100) : 0

                            return (
                                <div className="flex items-center gap-8">
                                    {/* Modern Recharts Pasta Grafiği */}
                                    <div className="relative w-64 h-64 flex-shrink-0">
                                        {total > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={chartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={90}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                        animationBegin={0}
                                                        animationDuration={800}
                                                    >
                                                        {chartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{
                                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                            border: '2px solid #e2e8f0',
                                                            borderRadius: '12px',
                                                            padding: '8px 12px',
                                                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                                                        }}
                                                        formatter={(value) => [`${value} görev`, '']}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                <div className="text-center">
                                                    <div className="text-4xl mb-2">📭</div>
                                                    <div className="text-sm">Görev bulunamadı</div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                            <div className="text-3xl font-bold text-slate-800">{total}</div>
                                            <div className="text-xs text-slate-500 font-medium">Toplam</div>
                                        </div>
                                    </div>

                                    {/* İstatistikler */}
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200 transition-all hover:shadow-md">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                <span className="text-sm font-medium text-slate-700">Tamamlandı</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-green-700">{completed}</span>
                                                <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{completedPercent}%</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200 transition-all hover:shadow-md">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                                <span className="text-sm font-medium text-slate-700">Devam Ediyor</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-blue-700">{inProgress}</span>
                                                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{inProgressPercent}%</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200 transition-all hover:shadow-md">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                                <span className="text-sm font-medium text-slate-700">Beklemede</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-yellow-700">{pending}</span>
                                                <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">{pendingPercent}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}
                    </div>

                    {/* Haftalık Takvim Widget */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span>📅</span> Haftalık Takvim
                            </h3>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={goToPreviousWeek}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Önceki Hafta"
                                >
                                    <span className="material-symbols-outlined text-slate-600">chevron_left</span>
                                </button>
                                <span className="text-sm font-medium text-slate-600 min-w-[120px] text-center">
                                    {weekDays[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - {weekDays[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                </span>
                                <button
                                    onClick={goToNextWeek}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Sonraki Hafta"
                                >
                                    <span className="material-symbols-outlined text-slate-600">chevron_right</span>
                                </button>
                                {selectedDate && (
                                    <button
                                        onClick={() => setSelectedDate(null)}
                                        className="ml-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                    >
                                        Tüm Görevler
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 7 Günlük Görünüm */}
                        <div className="grid grid-cols-7 gap-2">
                            {weekDays.map((day, index) => {
                                const dayTasks = getTasksForDate(day)
                                const isSelected = selectedDate?.toDateString() === day.toDateString()
                                const isToday = new Date().toDateString() === day.toDateString()
                                const dayNames = ['PAZ', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT']

                                return (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedDate(day)}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${isSelected
                                            ? 'bg-[#137fec] text-white shadow-lg shadow-[#137fec]/30'
                                            : isToday
                                                ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                                : 'hover:bg-slate-50 text-slate-600'
                                            }`}
                                    >
                                        <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                                            {dayNames[day.getDay()]}
                                        </span>
                                        <div className={`size-10 rounded-full flex items-center justify-center text-sm font-bold ${isSelected ? 'bg-white/20' : isToday ? 'bg-indigo-100' : ''
                                            }`}>
                                            {day.getDate()}
                                        </div>
                                        {/* Görev İndikatörleri */}
                                        <div className="flex gap-0.5 h-2">
                                            {dayTasks.slice(0, 3).map((task, i) => (
                                                <div
                                                    key={i}
                                                    className={`size-1.5 rounded-full ${task.priority === 'acil'
                                                        ? isSelected ? 'bg-white' : 'bg-red-400'
                                                        : task.priority === 'düşük'
                                                            ? isSelected ? 'bg-white' : 'bg-green-400'
                                                            : isSelected ? 'bg-white' : 'bg-amber-400'
                                                        }`}
                                                />
                                            ))}
                                            {dayTasks.length > 3 && (
                                                <span className={`text-[10px] ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                                                    +{dayTasks.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Seçili Günün Özeti */}
                        {selectedDate && (
                            <div className="mt-6 pt-6 border-t border-slate-200">
                                <h4 className="font-semibold text-slate-800 mb-3">
                                    {selectedDate.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} - {getTasksForDate(selectedDate).length} Görev
                                </h4>
                                <div className="text-sm text-slate-500">
                                    ℹ️ Aşağıdaki görev listesi seçili güne göre filtrelenmiştir
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Filtreleme Paneli - Kompakt Modern */}
                    <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                <h3 className="text-sm font-semibold text-slate-700">Filtreler</h3>
                            </div>
                            <button
                                onClick={clearFilters}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition-colors"
                            >
                                Temizle
                            </button>
                        </div>

                        <div className="space-y-4 mb-4">
                            {/* Arama */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Görev ara..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                                />
                                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-lg">search</span>
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Tarih Aralığı */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Başlangıç</label>
                                    <input
                                        type="date"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[34px]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Bitiş</label>
                                    <input
                                        type="date"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[34px]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            {/* Öncelik */}
                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-xs font-medium text-slate-500 self-center mr-1">Öncelik:</span>
                                <button
                                    onClick={() => setFilters({ ...filters, priority: 'all' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.priority === 'all'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    📋 Tümü
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, priority: 'acil' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.priority === 'acil'
                                        ? 'bg-red-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    🔴 Acil
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, priority: 'normal' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.priority === 'normal'
                                        ? 'bg-amber-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    🟡 Normal
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, priority: 'düşük' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.priority === 'düşük'
                                        ? 'bg-emerald-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    🟢 Düşük
                                </button>
                            </div>


                            {/* Atama */}
                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-xs font-medium text-slate-500 self-center mr-1">Atama:</span>
                                <button
                                    onClick={() => setFilters({ ...filters, assignment: 'all' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.assignment === 'all'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    👥 Hepsi
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, assignment: 'assigned_to_me' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.assignment === 'assigned_to_me'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    📥 Bana Atananlar
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, assignment: 'created_by_me' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.assignment === 'created_by_me'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    📤 Oluşturduklarım
                                </button>
                            </div>

                            {/* Durum */}
                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-xs font-medium text-slate-500 self-center mr-1">Durum:</span>
                                <button
                                    onClick={() => setFilters({ ...filters, status: 'all' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.status === 'all'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    📋 Tümü
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, status: 'pending' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.status === 'pending'
                                        ? 'bg-yellow-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    ⏸ Beklemede
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, status: 'in_progress' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.status === 'in_progress'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    ⏳ Devam Ediyor
                                </button>
                                <button
                                    onClick={() => setFilters({ ...filters, status: 'completed' })}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filters.status === 'completed'
                                        ? 'bg-green-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    ✅ Tamamlandı
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Görev Listesi */}
                    {loading ? (
                        <div className="text-center py-12 text-slate-500">Yükleniyor...</div>
                    ) : filteredTasks.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-slate-200">
                            <div className="text-6xl mb-4">📋</div>
                            <h3 className="text-xl font-semibold text-slate-700 mb-2">
                                {tasks.length === 0 ? 'Henüz görev yok' : 'Filtre sonucu bulunamadı'}
                            </h3>
                            <p className="text-slate-500 mb-4">
                                {tasks.length === 0
                                    ? 'İlk görevinizi oluşturarak başlayın!'
                                    : 'Farklı filtre seçeneklerini deneyin'}
                            </p>
                            {tasks.length === 0 && (
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium"
                                >
                                    Şimdi ekle &rarr;
                                </button>
                            )}
                        </div>
                    ) : profile?.role === 'super_admin' && groupedTasks ? (
                        <div className="space-y-4">
                            {Object.entries(groupedTasks).map(([unit, unitTasks]) => (
                                <div key={unit} className="bg-white rounded-xl shadow-sm border-2 border-slate-200 overflow-hidden transition-all hover:border-indigo-200">
                                    <button
                                        onClick={() => toggleGroup(unit)}
                                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-3xl">{getUnitIcon(unit)}</span>
                                            <h3 className="text-lg font-bold text-slate-800">{unit}</h3>
                                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                                                {unitTasks.length}
                                            </span>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-400 text-2xl">
                                            {collapsedGroups[unit] ? 'expand_more' : 'expand_less'}
                                        </span>
                                    </button>
                                    {!collapsedGroups[unit] && (
                                        <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 p-6 pt-2 ${unitTasks.length === 0 ? 'py-8' : ''}`}>
                                            {unitTasks.length === 0 ? (
                                                <div className="col-span-full text-center py-8 text-slate-400">
                                                    <span className="material-symbols-outlined text-5xl mb-2">inbox</span>
                                                    <p>Bu birimde görev yok</p>
                                                </div>
                                            ) : (
                                                unitTasks.map(task => (
                                                    <div key={task.id} onClick={() => navigate(`/tasks/${task.id}`)} className={`bg-white rounded-xl p-5 shadow-sm border transition-all hover:shadow-md cursor-pointer ${task.status === 'completed' ? 'border-green-100 bg-green-50/30' : 'border-slate-200'}`}>
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${task.priority === 'acil' ? 'bg-red-50 text-red-700 border-red-100' : task.priority === 'düşük' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{task.priority.toUpperCase()}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={(e) => { e.stopPropagation(); setEditingTask(task); setNewTask({ title: task.title, description: task.description || '', priority: task.priority, category: task.category || 'Yeni Proje', start_date: task.start_date ? task.start_date.split('T')[0] : '', due_date: task.due_date ? task.due_date.split('T')[0] : '', assignedUsers: task.assignments?.map(a => a.user.id) || [] }); setShowModal(true); }} className="w-6 h-6 rounded-full bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition-colors border border-transparent hover:border-indigo-100" title="Düzenle">✎</button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(task); }} className="w-6 h-6 rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors border border-transparent hover:border-red-100" title="Sil">🗑️</button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, task.status === 'completed' ? 'pending' : 'completed'); }} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${task.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-indigo-500 text-transparent'}`} title={task.status === 'completed' ? 'Tamamlandı olarak İşaretli' : 'Tamamla'}>✓</button>
                                                            </div>
                                                        </div>
                                                        <h3 className={`text-lg font-semibold mb-2 ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{task.title}</h3>
                                                        <div className="mb-3">
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${task.status === 'completed' ? 'bg-green-100 text-green-700' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>{task.status === 'completed' ? '✓ Tamamlandı' : task.status === 'in_progress' ? '⏳ Devam Ediyor' : '⏸ Beklemede'}</span>
                                                        </div>
                                                        <p className="text-slate-600 text-sm mb-4 line-clamp-3">{task.description}</p>
                                                        <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100 mt-auto">
                                                            <div className="flex flex-col gap-1">
                                                                <span>📅 {task.due_date ? new Date(task.due_date).toLocaleDateString('tr-TR') : 'Tarih yok'}</span>
                                                                {task.assignments && task.assignments.length > 0 && <span className="text-indigo-600">👤 {task.assignments.length === 1 ? task.assignments[0].user?.full_name?.split(' ')[0] : `${task.assignments[0].user?.full_name?.split(' ')[0]} +${task.assignments.length - 1}`}</span>}
                                                            </div>
                                                            <div>Atayan: {task.creator?.full_name?.split(' ')[0] || 'Kendim'}</div>
                                                        </div>
                                                        <button onClick={(e) => { e.stopPropagation(); toggleComments(task.id); }} className="mt-3 w-full py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center gap-2">💬 Yorumlar {expandedTask === task.id ? '▲' : '▼'}</button>
                                                        {expandedTask === task.id && <div className="mt-3 pt-3 border-t border-slate-200 space-y-3" onClick={(e) => e.stopPropagation()}>{loadingComments ? <p className="text-xs text-slate-400 text-center">Yorumlar yükleniyor...</p> : comments.length === 0 ? <p className="text-xs text-slate-400 text-center">Henüz yorum yok</p> : <div className="max-h-48 overflow-y-auto space-y-2 pr-2">{comments.map(comment => <div key={comment.id} className="flex gap-2 bg-slate-50 p-3 rounded-lg group"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-slate-700">{comment.user?.full_name || comment.user?.username || 'Bilinmiyor'}</span><span className="text-xs text-slate-400">{new Date(comment.created_at).toLocaleDateString('tr-TR')}</span></div><p className="text-xs text-slate-600">{comment.content}</p></div>{comment.created_by === user.id && <button onClick={() => handleDeleteComment(comment.id, task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-red-500 hover:text-red-700" title="Yorumu Sil">🗑️</button>}</div>)}</div>}<div className="flex gap-2"><input type="text" placeholder="Yorum ekle..." value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter') handleAddComment(task.id); }} className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" /><button onClick={() => handleAddComment(task.id)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">Gönder</button></div></div>}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {filteredTasks.map(task => (
                                <div
                                    key={task.id}
                                    onClick={() => navigate(`/tasks/${task.id}`)}
                                    className={`bg-white rounded-xl p-5 shadow-sm border transition-all hover:shadow-md cursor-pointer ${task.status === 'completed' ? 'border-green-100 bg-green-50/30' : 'border-slate-200'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${task.priority === 'acil' ? 'bg-red-50 text-red-700 border-red-100' :
                                                task.priority === 'düşük' ? 'bg-green-50 text-green-700 border-green-100' :
                                                    'bg-amber-50 text-amber-700 border-amber-100'
                                                }`}>
                                                {task.priority.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Düzenle Butonu */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditingTask(task)
                                                    setNewTask({
                                                        title: task.title,
                                                        description: task.description || '',
                                                        priority: task.priority,
                                                        category: task.category || 'Yeni Proje',
                                                        start_date: task.start_date ? task.start_date.split('T')[0] : '',
                                                        due_date: task.due_date ? task.due_date.split('T')[0] : '',
                                                        assignedUsers: task.assignments?.map(a => a.user.id) || []
                                                    })
                                                    setShowModal(true)
                                                }}
                                                className="w-6 h-6 rounded-full bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition-colors border border-transparent hover:border-indigo-100"
                                                title="Düzenle"
                                            >
                                                ✎
                                            </button>

                                            {/* Sil Butonu */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteClick(task)
                                                }}
                                                className="w-6 h-6 rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors border border-transparent hover:border-red-100"
                                                title="Sil"
                                            >
                                                🗑️
                                            </button>

                                            {/* Tamamla Butonu */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleStatusChange(task.id, task.status === 'completed' ? 'pending' : 'completed')
                                                }}
                                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${task.status === 'completed'
                                                    ? 'bg-green-500 border-green-500 text-white'
                                                    : 'border-slate-300 hover:border-indigo-500 text-transparent'
                                                    }`}
                                                title={task.status === 'completed' ? 'Tamamlandı olarak işaretli' : 'Tamamla'}
                                            >
                                                ✓
                                            </button>
                                        </div>
                                    </div>

                                    <h3 className={`text-lg font-semibold mb-2 ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                        {task.title}
                                    </h3>
                                    {/* Durum Badge'i */}
                                    <div className="mb-3">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${task.status === 'completed' ? 'bg-green-100 text-green-700' :
                                            task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {task.status === 'completed' ? '✓ Tamamlandı' :
                                                task.status === 'in_progress' ? '⏳ Devam Ediyor' :
                                                    '⏸ Beklemede'}
                                        </span>
                                    </div>
                                    <p className="text-slate-600 text-sm mb-4 line-clamp-3">{task.description}</p>

                                    <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100 mt-auto">
                                        <div className="flex flex-col gap-1">
                                            <span>📅 {task.due_date ? new Date(task.due_date).toLocaleDateString('tr-TR') : 'Tarih yok'}</span>
                                            {task.assignments && task.assignments.length > 0 && (
                                                <span className="text-indigo-600">
                                                    👤 {task.assignments.length === 1
                                                        ? task.assignments[0].user?.full_name?.split(' ')[0]
                                                        : `${task.assignments[0].user?.full_name?.split(' ')[0]} +${task.assignments.length - 1}`
                                                    }
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            Atayan: {task.creator?.full_name?.split(' ')[0] || 'Kendim'}
                                        </div>
                                    </div>

                                    {/* Yorum Butonu */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            toggleComments(task.id)
                                        }}
                                        className="mt-3 w-full py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        💬 Yorumlar {expandedTask === task.id ? '▲' : '▼'}
                                    </button>

                                    {/* Yorum Bölümü (Açılır Kapanır) */}
                                    {expandedTask === task.id && (
                                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                                            {loadingComments ? (
                                                <p className="text-xs text-slate-400 text-center">Yorumlar yükleniyor...</p>
                                            ) : comments.length === 0 ? (
                                                <p className="text-xs text-slate-400 text-center">Henüz yorum yok</p>
                                            ) : (
                                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                                    {comments.map(comment => (
                                                        <div key={comment.id} className="bg-slate-50 rounded-lg p-3 text-sm">
                                                            <div className="flex justify-between items-start mb-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-semibold text-slate-700">
                                                                        {comment.author?.full_name || comment.author?.username || 'Anonim'}
                                                                    </span>
                                                                    <span className="text-xs text-slate-400">
                                                                        {new Date(comment.created_at).toLocaleString('tr-TR', {
                                                                            day: 'numeric',
                                                                            month: 'short',
                                                                            hour: '2-digit',
                                                                            minute: '2-digit'
                                                                        })}
                                                                    </span>
                                                                </div>
                                                                {comment.user_id === user.id && (
                                                                    <button
                                                                        onClick={() => handleDeleteComment(comment.id, task.id)}
                                                                        className="text-red-400 hover:text-red-600 text-xs"
                                                                        title="Sil"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <p className="text-slate-600">{comment.content}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Yeni Yorum Ekleme Input */}
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Yorum ekle..."
                                                    value={newComment}
                                                    onChange={(e) => setNewComment(e.target.value)}
                                                    onKeyPress={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleAddComment(task.id)
                                                        }
                                                    }}
                                                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                />
                                                <button
                                                    onClick={() => handleAddComment(task.id)}
                                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                                                >
                                                    Gönder
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Modal - Yeni Görev Ekleme */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-800">{editingTask ? 'Görevi Düzenle' : 'Yeni Görev Oluştur'}</h3>
                                <button onClick={() => { setShowModal(false); setEditingTask(null); }} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>

                            <form onSubmit={handleSaveTask} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Başlık</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-900"
                                        placeholder="örn: Aylık Raporu Hazırla"
                                        value={newTask.title}
                                        onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Açıklama</label>
                                    <textarea
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none h-24 resize-none text-slate-900"
                                        placeholder="Görevin detayları..."
                                        value={newTask.description}
                                        onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Tarihler Yan Yana - %50/%50 */}
                                    <div className="grid grid-cols-2 gap-4 col-span-2">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Başlangıç Tarihi</label>
                                            <input
                                                type="date"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-900"
                                                value={newTask.start_date}
                                                onChange={e => setNewTask({ ...newTask, start_date: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Son Tarih</label>
                                            <input
                                                type="date"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-900"
                                                value={newTask.due_date}
                                                onChange={e => setNewTask({ ...newTask, due_date: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {/* Öncelik - Tarihlerin Altında */}
                                    {/* Öncelik ve Kategori - Tarihlerin Altında */}
                                    <div className="grid grid-cols-2 gap-4 col-span-2">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Öncelik</label>
                                            <select
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-900"
                                                value={newTask.priority}
                                                onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                                            >
                                                <option value="düşük">Düşük</option>
                                                <option value="normal">Normal</option>
                                                <option value="acil">Acil 🚨</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Kullanıcı Seçimi (Multi-select) - SADECE admin ve unit_manager için */}
                                {(profile?.role === 'super_admin' || profile?.role === 'unit_manager') && availableUsers.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Atanacak Kişiler (Çoklu Seçim)
                                        </label>
                                        <div className="max-h-48 overflow-y-auto border border-slate-300 rounded-lg p-3 space-y-2">
                                            {availableUsers
                                                .filter(u => {
                                                    // Unit manager sadece kendi birimindekileri görsün
                                                    if (profile?.role === 'unit_manager') {
                                                        return u.unit === profile.unit
                                                    }
                                                    return true
                                                })
                                                .map(u => (
                                                    <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={newTask.assignedUsers?.includes(u.id) || false}
                                                            onChange={(e) => {
                                                                const currentUsers = newTask.assignedUsers || []
                                                                if (e.target.checked) {
                                                                    setNewTask({ ...newTask, assignedUsers: [...currentUsers, u.id] })
                                                                } else {
                                                                    setNewTask({ ...newTask, assignedUsers: currentUsers.filter(id => id !== u.id) })
                                                                }
                                                            }}
                                                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                        />
                                                        <span className="text-sm text-slate-700">
                                                            {u.full_name || u.username}
                                                            <span className="text-xs text-slate-500 ml-1">({u.unit})</span>
                                                        </span>
                                                    </label>
                                                ))
                                            }
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {newTask.assignedUsers?.length > 0
                                                ? `${newTask.assignedUsers.length} kişi seçildi`
                                                : 'Seçim yapılmazsa görevi kendinize atarsınız'}
                                        </p>
                                    </div>
                                )}

                                <div className="pt-4 flex gap-3 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg"
                                    >
                                        {editingTask ? 'Güncelle' : 'Oluştur'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modern Silme Onay Modalı */}
                {showDeleteModal && taskToDelete && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all animate-scaleIn">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                        <span className="text-2xl">⚠️</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800">Görevi Sil</h3>
                                        <p className="text-sm text-slate-500">Bu işlem geri alınamaz</p>
                                    </div>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-6 space-y-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                    <p className="text-sm font-medium text-slate-700 mb-1">Silinecek Görev:</p>
                                    <p className="text-base font-semibold text-slate-900">{taskToDelete.title}</p>
                                </div>

                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                    <p className="text-sm text-amber-800">
                                        <strong>Dikkat:</strong> Bu görevi sildiğinizde, görevle ilgili <strong>tüm adımlar</strong> ve <strong>yorumlar</strong> da kalıcı olarak silinecektir.
                                    </p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteModal(false)
                                        setTaskToDelete(null)
                                    }}
                                    className="px-6 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteTask()}
                                    className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors shadow-lg shadow-red-500/30"
                                >
                                    🗑️ Evet, Sil
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </main >
        </div >
    )
}
