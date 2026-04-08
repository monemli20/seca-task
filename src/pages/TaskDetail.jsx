import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import DatePicker from 'react-datepicker'
import { tr } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import '../datepicker-custom.css'

export default function TaskDetail() {
    const { taskId } = useParams()
    const navigate = useNavigate()
    const [task, setTask] = useState(null)
    const [assignments, setAssignments] = useState([])
    const [steps, setSteps] = useState([])
    const [loading, setLoading] = useState(true)
    const [currentUser, setCurrentUser] = useState(null)

    // Yeni adım formu state
    const [newStep, setNewStep] = useState({
        description: '',
        start_time: null,
        end_time: null
    })
    const [submitting, setSubmitting] = useState(false)

    // Adım düzenleme state
    const [editingStepId, setEditingStepId] = useState(null)
    const [editingStepData, setEditingStepData] = useState({
        description: '',
        start_time: null,
        end_time: null
    })

    // Kullanıcı bazında çalışma istatistiklerini hesapla
    const userStats = useMemo(() => {
        if (!steps || steps.length === 0) return null

        // Kullanıcı bazında grupla ve topla
        const statsMap = {}
        let totalHours = 0

        steps.forEach(step => {
            const userId = step.user_id
            const userName = step.user?.full_name || step.user?.username || 'Bilinmeyen'
            const hours = parseFloat(step.work_hours) || 0

            if (!statsMap[userId]) {
                statsMap[userId] = {
                    userId,
                    userName,
                    totalHours: 0,
                    stepCount: 0
                }
            }

            statsMap[userId].totalHours += hours
            statsMap[userId].stepCount += 1
            totalHours += hours
        })

        // Diziye çevir ve sırala
        const statsArray = Object.values(statsMap).map(stat => ({
            ...stat,
            percentage: totalHours > 0 ? (stat.totalHours / totalHours) * 100 : 0
        })).sort((a, b) => b.totalHours - a.totalHours)

        return {
            users: statsArray,
            totalHours,
            contributorCount: statsArray.length
        }
    }, [steps])


    useEffect(() => {
        checkUserAndFetchData()
    }, [taskId])

    async function checkUserAndFetchData() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                navigate('/')
                return
            }

            // Profil bilgisini çek
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            setCurrentUser({ ...user, ...profile })
            await fetchTaskDetails()
        } catch (error) {
            console.error('Veri çekme hatası:', error)
        } finally {
            setLoading(false)
        }
    }

    async function fetchTaskDetails() {
        try {
            // 1. Görev Detayları
            const { data: taskData, error: taskError } = await supabase
                .from('tasks')
                .select(`*, creator:created_by(full_name)`)
                .eq('id', taskId)
                .single()

            if (taskError) throw taskError
            setTask(taskData)

            // 2. Atanan Kişiler (RPC ile)
            const { data: assignees, error: assignError } = await supabase
                .rpc('get_task_assignees', { target_task_id: taskId })

            if (!assignError) setAssignments(assignees || [])

            // 3. Görev Adımları
            await fetchSteps()
        } catch (error) {
            console.error('Görev detayı hatası:', error)
            alert('Görev bulunamadı veya erişim yetkiniz yok.')
            navigate('/dashboard')
        }
    }

    async function fetchSteps() {
        const { data: stepsData, error } = await supabase
            .from('task_steps')
            .select(`
                *,
                user:user_id(full_name, username)
            `)
            .eq('task_id', taskId)
            .order('work_date', { ascending: false })
            .order('created_at', { ascending: false })

        if (!error) setSteps(stepsData || [])
    }

    async function handleAddStep(e) {
        e.preventDefault()
        setSubmitting(true)

        if (!newStep.start_time || !newStep.end_time) {
            alert('Lütfen başlangıç ve bitiş saatlerini giriniz.')
            setSubmitting(false)
            return
        }

        try {
            // Tarihleri ISO 8601 formatına çevir (PostgreSQL için)
            const startISO = newStep.start_time?.toISOString()
            const endISO = newStep.end_time?.toISOString()

            console.log('📤 Gönderilen Veri:', {
                p_task_id: parseInt(taskId, 10),
                p_description: newStep.description,
                p_start_time: startISO,
                p_end_time: endISO
            })

            // RPC fonksiyonunu çağır (RLS Bypass)
            const { data, error } = await supabase
                .rpc('add_task_step', {
                    p_task_id: parseInt(taskId, 10), // String'den integer'a çevir
                    p_description: newStep.description,
                    p_start_time: startISO,
                    p_end_time: endISO
                })

            if (error) throw error

            // Formu sıfırla ve listeyi güncelle
            setNewStep({
                description: '',
                start_time: null,
                end_time: null
            })
            await fetchSteps()
        } catch (error) {
            alert('Adım eklenirken hata: ' + error.message)
            console.error(error)
        } finally {
            setSubmitting(false)
        }
    }

    // Adım silme fonksiyonu
    async function handleDeleteStep(stepId) {
        if (!confirm('Bu adımı silmek istediğinizden emin misiniz?')) return

        try {
            const { error } = await supabase
                .from('task_steps')
                .delete()
                .eq('id', stepId)

            if (error) throw error

            await fetchSteps()
        } catch (error) {
            alert('Adım silinirken hata: ' + error.message)
            console.error(error)
        }
    }

    // Adım düzenlemeye başla
    function startEditingStep(step) {
        setEditingStepId(step.id)
        setEditingStepData({
            description: step.description,
            start_time: step.start_time ? new Date(step.start_time) : null,
            end_time: step.end_time ? new Date(step.end_time) : null
        })
    }

    // Adımı düzenlemeyi iptal et
    function cancelEditingStep() {
        setEditingStepId(null)
        setEditingStepData({
            description: '',
            start_time: null,
            end_time: null
        })
    }

    // Adım güncelleme fonksiyonu
    async function handleUpdateStep(e) {
        e.preventDefault()

        if (!editingStepData.start_time || !editingStepData.end_time) {
            alert('Lütfen başlangıç ve bitiş saatlerini giriniz.')
            return
        }

        try {
            const startISO = editingStepData.start_time.toISOString()
            const endISO = editingStepData.end_time.toISOString()

            // Çalışma saati hesapla
            const workHours = ((editingStepData.end_time - editingStepData.start_time) / (1000 * 60 * 60)).toFixed(2)

            const { error } = await supabase
                .from('task_steps')
                .update({
                    description: editingStepData.description,
                    start_time: startISO,
                    end_time: endISO,
                    work_hours: parseFloat(workHours)
                })
                .eq('id', editingStepId)

            if (error) throw error

            cancelEditingStep()
            await fetchSteps()
        } catch (error) {
            alert('Adım güncellenirken hata: ' + error.message)
            console.error(error)
        }
    }


    // Yetki Kontrolü: Adım ekleyebilir mi?
    // Atananlar, Oluşturan veya Admin/Manager
    const canAddStep = currentUser && (
        assignments.some(a => a.user_id === currentUser.id) ||
        task?.created_by === currentUser.id ||
        ['super_admin', 'unit_manager'].includes(currentUser.role)
    )

    if (loading) return <div className="p-10 text-center">Yükleniyor...</div>
    if (!task) return null

    return (
        <div className="flex bg-slate-50 min-h-screen">
            {/* Basit Sidebar (Dashboard ile uyumlu olması için kopyalanabilir veya layout yapılabilir) */}
            <div className="w-64 bg-slate-900 text-white p-6 hidden md:block">
                <h1 className="text-2xl font-bold mb-8 flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    </div>
                    TaskFlow
                </h1>
                <button onClick={() => navigate('/dashboard')} className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 rounded-xl mb-2 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                    Dashboard
                </button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto">
                {/* Header & Back Button */}
                <div className="mb-6 flex items-center justify-between">
                    <button onClick={() => navigate('/dashboard')} className="flex items-center text-slate-500 hover:text-slate-800">
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        Geri Dön
                    </button>
                    <div className="text-sm text-slate-500">
                        Oluşturan: <span className="font-medium text-slate-900">{task.creator?.full_name}</span> • {new Date(task.created_at).toLocaleDateString('tr-TR')}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 mb-2">{task.title}</h1>
                            <div className="flex items-center gap-3">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide 
                                    ${task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                        task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-slate-100 text-slate-600'}`}>
                                    {task.priority === 'urgent' ? 'Acil' : task.priority === 'normal' ? 'Normal' : 'Düşük'}
                                </span>
                                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium uppercase">
                                    {task.status.replace('_', ' ')}
                                </span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-500 mb-1">Son Tarih</p>
                            <p className="text-lg font-semibold text-slate-800">
                                {task.due_date ? new Date(task.due_date).toLocaleDateString('tr-TR') : '-'}
                            </p>
                        </div>
                    </div>

                    <p className="text-slate-600 leading-relaxed mb-8 border-b border-slate-100 pb-8">
                        {task.description || 'Açıklama yok.'}
                    </p>

                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Görev Ekibi</h3>
                        <div className="flex flex-wrap gap-2">
                            {assignments.length > 0 ? (
                                assignments.map(a => (
                                    <div key={a.user_id} className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                            {a.full_name?.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">{a.full_name}</p>
                                            <p className="text-xs text-slate-500">@{a.username}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <span className="text-slate-400 text-sm italic">Henüz kimse atanmamış.</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* GÖREV ADIMLARI (İŞ SÜRECİ) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* SOL: Adım Ekleme Formu */}
                    {canAddStep && (
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-8">
                                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                    Yeni Adım Ekle
                                </h3>
                                <form onSubmit={handleAddStep} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Yapılan İş</label>
                                        <textarea
                                            required
                                            value={newStep.description}
                                            onChange={e => setNewStep({ ...newStep, description: e.target.value })}
                                            className="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                                            rows="3"
                                            placeholder="Ne üzerinde çalıştınız?"
                                        ></textarea>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            Başlangıç Zamanı
                                        </label>
                                        <div className="relative">
                                            <DatePicker
                                                selected={newStep.start_time}
                                                onChange={date => setNewStep({ ...newStep, start_time: date })}
                                                showTimeSelect
                                                showTimeInput
                                                timeFormat="HH:mm"
                                                timeIntervals={5}
                                                dateFormat="dd/MM/yyyy HH:mm"
                                                locale={tr}
                                                placeholderText="Tarih ve saat seçin"
                                                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all duration-200 hover:border-indigo-300 bg-gradient-to-br from-white to-slate-50"
                                                wrapperClassName="w-full"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            Bitiş Zamanı
                                        </label>
                                        <div className="relative">
                                            <DatePicker
                                                selected={newStep.end_time}
                                                onChange={date => setNewStep({ ...newStep, end_time: date })}
                                                showTimeSelect
                                                showTimeInput
                                                timeFormat="HH:mm"
                                                timeIntervals={5}
                                                dateFormat="dd/MM/yyyy HH:mm"
                                                locale={tr}
                                                placeholderText="Tarih ve saat seçin"
                                                minDate={newStep.start_time || new Date()}
                                                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm transition-all duration-200 hover:border-indigo-300 bg-gradient-to-br from-white to-slate-50"
                                                wrapperClassName="w-full"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm font-medium"
                                    >
                                        {submitting ? 'Ekleniyor...' : 'Adımı Kaydet'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* SAĞ: Adımlar Listesi */}
                    <div className={canAddStep ? "lg:col-span-2" : "lg:col-span-3"}>
                        {/* Çalışma İstatistikleri */}
                        {userStats && userStats.totalHours > 0 && (
                            <div className="mb-6 bg-gradient-to-br from-white to-slate-50 rounded-2xl border-2 border-slate-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                        </svg>
                                        Çalışma İstatistikleri
                                    </h3>
                                    <p className="text-indigo-100 text-sm mt-1">
                                        Toplam: <span className="font-semibold text-white">{userStats.totalHours.toFixed(1)} saat</span> • {userStats.contributorCount} kişi
                                    </p>
                                </div>

                                <div className="p-6 space-y-4">
                                    {userStats.users.map((user, index) => {
                                        const colors = [
                                            'from-indigo-500 to-purple-500',
                                            'from-blue-500 to-cyan-500',
                                            'from-emerald-500 to-teal-500',
                                            'from-amber-500 to-orange-500',
                                            'from-pink-500 to-rose-500'
                                        ]
                                        const bgColors = [
                                            'bg-indigo-100 text-indigo-700',
                                            'bg-blue-100 text-blue-700',
                                            'bg-emerald-100 text-emerald-700',
                                            'bg-amber-100 text-amber-700',
                                            'bg-pink-100 text-pink-700'
                                        ]
                                        const colorIndex = index % colors.length

                                        return (
                                            <div key={user.userId} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-9 h-9 rounded-full ${bgColors[colorIndex]} flex items-center justify-center font-bold text-sm`}>
                                                            {(() => {
                                                                const parts = user.userName.split(' ')
                                                                if (parts.length > 1) {
                                                                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                                                                }
                                                                return user.userName.substring(0, 2).toUpperCase()
                                                            })()}
                                                        </div>
                                                        <span className="font-medium text-slate-900">{user.userName}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-bold text-slate-900">{user.totalHours.toFixed(1)} sa</span>
                                                        <span className="text-sm text-slate-500 ml-2">({user.percentage.toFixed(0)}%)</span>
                                                    </div>
                                                </div>
                                                <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full bg-gradient-to-r ${colors[colorIndex]} transition-all duration-500 ease-out rounded-full shadow-sm`}
                                                        style={{ width: `${user.percentage}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                            İş Akışı / Adımlar
                            <span className="bg-slate-100 text-slate-600 py-0.5 px-2 rounded-full text-xs ml-2">{steps.length}</span>
                        </h3>

                        <div className="space-y-4">
                            {steps.length > 0 ? (
                                steps.map(step => (
                                    <div key={step.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors relative pl-6">
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 rounded-l-xl"></div>

                                        {/* Editing Mode */}
                                        {editingStepId === step.id ? (
                                            <form onSubmit={handleUpdateStep} className="space-y-3">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h4 className="font-semibold text-indigo-600">Adımı Düzenle</h4>
                                                    <button
                                                        type="button"
                                                        onClick={cancelEditingStep}
                                                        className="text-slate-400 hover:text-slate-600"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                <textarea
                                                    value={editingStepData.description}
                                                    onChange={(e) => setEditingStepData({ ...editingStepData, description: e.target.value })}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                    rows="3"
                                                    placeholder="Açıklama"
                                                    required
                                                />

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-700 mb-1">Başlangıç</label>
                                                        <input
                                                            type="datetime-local"
                                                            value={editingStepData.start_time ? editingStepData.start_time.toISOString().slice(0, 16) : ''}
                                                            onChange={(e) => setEditingStepData({ ...editingStepData, start_time: new Date(e.target.value) })}
                                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-700 mb-1">Bitiş</label>
                                                        <input
                                                            type="datetime-local"
                                                            value={editingStepData.end_time ? editingStepData.end_time.toISOString().slice(0, 16) : ''}
                                                            onChange={(e) => setEditingStepData({ ...editingStepData, end_time: new Date(e.target.value) })}
                                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                            required
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={cancelEditingStep}
                                                        className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                    >
                                                        İptal
                                                    </button>
                                                    <button
                                                        type="submit"
                                                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                                                    >
                                                        Kaydet
                                                    </button>
                                                </div>
                                            </form>
                                        ) : (
                                            /* View Mode */
                                            <>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                                                            {step.user?.full_name?.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <span className="font-semibold text-slate-900">{step.user?.full_name}</span>
                                                        <span className="text-xs text-slate-400">•</span>
                                                        <span className="text-xs text-slate-500">
                                                            {step.start_time ? (
                                                                <>
                                                                    {new Date(step.start_time).toLocaleDateString('tr-TR')}
                                                                    <span className="mx-1 text-slate-300">|</span>
                                                                    {new Date(step.start_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} -
                                                                    {new Date(step.end_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                                </>
                                                            ) : (
                                                                new Date(step.work_date).toLocaleDateString('tr-TR')
                                                            )}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">
                                                            {step.work_hours} Saat
                                                        </span>

                                                        {/* Edit & Delete Buttons - Sadece adımı oluşturan veya yöneticiler görebilir */}
                                                        {(currentUser?.id === step.user_id || ['super_admin', 'unit_manager'].includes(currentUser?.role)) && (
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => startEditingStep(step)}
                                                                    className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors group"
                                                                    title="Düzenle"
                                                                >
                                                                    <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteStep(step.id)}
                                                                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group"
                                                                    title="Sil"
                                                                >
                                                                    <svg className="w-4 h-4 text-slate-400 group-hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-slate-600 text-sm whitespace-pre-wrap">{step.description}</p>
                                            </>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                    </div>
                                    <p className="text-slate-500">Henüz hiç görev adımı eklenmemiş.</p>
                                    {canAddStep && <p className="text-sm text-indigo-600 mt-1">İlk adımı soldaki formdan ekleyebilirsiniz.</p>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
