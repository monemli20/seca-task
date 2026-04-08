import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'

export default function TeamStats() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [profile, setProfile] = useState(null)
    const [teamStats, setTeamStats] = useState([])
    const [unitStats, setUnitStats] = useState([])
    const [selectedUnit, setSelectedUnit] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchProfile()
    }, [user])

    useEffect(() => {
        if (profile) {
            // Role-based data fetching
            if (profile.role === 'super_admin') {
                if (selectedUnit) {
                    fetchTeamStats(selectedUnit)
                } else {
                    fetchUnitStats()
                }
            } else if (profile.role === 'unit_manager') {
                fetchTeamStats(profile.unit)
            } else {
                // Regular users can't access this page
                navigate('/dashboard')
            }
        }
    }, [profile, selectedUnit])

    async function fetchProfile() {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (error) throw error
            setProfile(data)
        } catch (error) {
            console.error('Profile yüklenemedi:', error)
        }
    }

    async function fetchUnitStats() {
        try {
            setLoading(true)
            console.log('📊 Fetching unit stats for super admin...')

            // Fetch all users with their units
            const { data: allUsers, error: usersError } = await supabase
                .from('profiles')
                .select('id, unit, role')
                .in('role', ['user', 'unit_manager'])
                .not('unit', 'is', null)

            if (usersError) {
                console.error('❌ Users error:', usersError)
                throw usersError
            }

            console.log('✅ Users data:', allUsers)

            // Fetch all task assignments with task status
            const { data: allAssignments, error: assignError } = await supabase
                .from('task_assignments')
                .select(`
                    user_id,
                    task_id,
                    tasks!inner(status)
                `)

            if (assignError) {
                console.error('❌ Assignments error:', assignError)
                throw assignError
            }

            console.log('✅ Assignments data:', allAssignments)

            // Group by unit
            const units = ['Yönetim', 'Vision & Software', 'Atölye', 'Otomasyon', 'Mekanik', 'Satış & Pazarlama']
            const stats = units.map(unit => {
                const unitUsers = allUsers.filter(u => u.unit === unit)
                const unitUserIds = unitUsers.map(u => u.id)

                const unitAssignments = allAssignments?.filter(a =>
                    unitUserIds.includes(a.user_id)
                ) || []

                const totalTasks = unitAssignments.length
                const completed = unitAssignments.filter(a => a.tasks?.status === 'completed').length
                const inProgress = unitAssignments.filter(a => a.tasks?.status === 'in_progress').length
                const pending = unitAssignments.filter(a => a.tasks?.status === 'pending').length

                console.log(`📈 ${unit}:`, { totalTasks, completed, inProgress, pending })

                return {
                    unit,
                    memberCount: unitUsers.length,
                    totalTasks,
                    completed,
                    inProgress,
                    pending,
                    completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0
                }
            })

            console.log('✅ Final stats:', stats)
            setUnitStats(stats)
        } catch (error) {
            console.error('❌ Unit stats yüklenemedi:', error)
        } finally {
            setLoading(false)
        }
    }

    async function fetchTeamStats(unit) {
        try {
            setLoading(true)
            console.log(`👥 Fetching team stats for unit: ${unit}`)

            // Fetch team members in the unit
            const { data: members, error: membersError } = await supabase
                .from('profiles')
                .select('id, full_name, username, role, unit')
                .eq('unit', unit)
                .in('role', ['user', 'unit_manager'])
                .order('full_name')

            if (membersError) {
                console.error('❌ Members error:', membersError)
                throw membersError
            }

            console.log('✅ Members data:', members)

            // Fetch task assignments for all members at once
            const memberIds = members.map(m => m.id)
            const { data: allAssignments, error: assignError } = await supabase
                .from('task_assignments')
                .select(`
                    user_id,
                    task_id,
                    tasks!inner(status, title, priority)
                `)
                .in('user_id', memberIds)

            if (assignError) {
                console.error('❌ Assignments error:', assignError)
                throw assignError
            }

            console.log('✅ Assignments data:', allAssignments)

            // Calculate stats for each member
            const stats = members.map(member => {
                const memberAssignments = allAssignments?.filter(a => a.user_id === member.id) || []

                const totalTasks = memberAssignments.length
                const completed = memberAssignments.filter(a => a.tasks?.status === 'completed').length
                const inProgress = memberAssignments.filter(a => a.tasks?.status === 'in_progress').length
                const pending = memberAssignments.filter(a => a.tasks?.status === 'pending').length

                console.log(`📊 ${member.full_name}:`, { totalTasks, completed, inProgress, pending })

                return {
                    ...member,
                    totalTasks,
                    completed,
                    inProgress,
                    pending,
                    completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0
                }
            })

            console.log('✅ Final team stats:', stats)
            setTeamStats(stats)
        } catch (error) {
            console.error('❌ Team stats yüklenemedi:', error)
        } finally {
            setLoading(false)
        }
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
        return icons[unit] || '📊'
    }

    function getInitials(name) {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-slate-600">Yükleniyor...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#f6f7f8]">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-8 py-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">
                            {selectedUnit ? `Team Stats - ${selectedUnit}` : 'Team Stats'}
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            {profile?.role === 'super_admin' && !selectedUnit && 'Birim bazında istatistikler'}
                            {profile?.role === 'super_admin' && selectedUnit && 'Ekip üyesi detayları'}
                            {profile?.role === 'unit_manager' && `${profile.unit} birimi ekip istatistikleri`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedUnit && (
                            <button
                                onClick={() => setSelectedUnit(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">arrow_back</span>
                                Birimlere Dön
                            </button>
                        )}
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                        >
                            Dashboard'a Dön
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="p-8">
                {/* Super Admin - Unit Overview */}
                {profile?.role === 'super_admin' && !selectedUnit && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {unitStats.map(unit => (
                            <div
                                key={unit.unit}
                                onClick={() => setSelectedUnit(unit.unit)}
                                className="bg-white rounded-xl shadow-sm border-2 border-slate-200 p-6 hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer group"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-2xl">
                                        {getUnitIcon(unit.unit)}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                            {unit.unit}
                                        </h3>
                                        <p className="text-sm text-slate-500">{unit.memberCount} kişi</p>
                                    </div>
                                </div>

                                <div className="space-y-2 mb-4">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">Toplam Görev</span>
                                        <span className="font-semibold text-slate-800">{unit.totalTasks}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">✅ Tamamlanan</span>
                                        <span className="font-semibold text-green-600">{unit.completed}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">🔄 Devam Eden</span>
                                        <span className="font-semibold text-blue-600">{unit.inProgress}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">⏳ Bekleyen</span>
                                        <span className="font-semibold text-amber-600">{unit.pending}</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="mb-2">
                                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                        <span>Tamamlanma Oranı</span>
                                        <span className="font-semibold">{unit.completionRate}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                                            style={{ width: `${unit.completionRate}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 text-center">
                                    <span className="text-xs text-slate-500 group-hover:text-indigo-600 transition-colors">
                                        Detayları görüntüle →
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Team Member Stats (Unit Manager or Super Admin drill-down) */}
                {(profile?.role === 'unit_manager' || (profile?.role === 'super_admin' && selectedUnit)) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {teamStats.map(member => (
                            <div
                                key={member.id}
                                className="bg-white rounded-xl shadow-sm border-2 border-slate-200 p-6 hover:shadow-lg hover:border-indigo-300 transition-all"
                            >
                                {/* Avatar and Name */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                        {getInitials(member.full_name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-bold text-slate-800 truncate">
                                            {member.full_name}
                                        </h3>
                                        <p className="text-xs text-slate-500">@{member.username}</p>
                                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${member.role === 'unit_manager'
                                            ? 'bg-purple-100 text-purple-700'
                                            : 'bg-slate-100 text-slate-600'
                                            }`}>
                                            {member.role === 'unit_manager' ? 'Birim Amiri' : 'Kullanıcı'}
                                        </span>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="space-y-2.5 mb-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-600 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-base">assignment</span>
                                            Toplam
                                        </span>
                                        <span className="font-semibold text-slate-800">{member.totalTasks}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-600">✅ Tamamlanan</span>
                                        <span className="font-semibold text-green-600">{member.completed}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-600">🔄 Devam Eden</span>
                                        <span className="font-semibold text-blue-600">{member.inProgress}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-600">⏳ Bekleyen</span>
                                        <span className="font-semibold text-amber-600">{member.pending}</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div>
                                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                                        <span>Başarı Oranı</span>
                                        <span className="font-bold text-sm">{member.completionRate}%</span>
                                    </div>
                                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all ${member.completionRate >= 75 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                                                member.completionRate >= 50 ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                                                    member.completionRate >= 25 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                                                        'bg-gradient-to-r from-red-500 to-rose-500'
                                                }`}
                                            style={{ width: `${member.completionRate}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        {teamStats.length === 0 && (
                            <div className="col-span-full text-center py-12">
                                <span className="material-symbols-outlined text-6xl text-slate-300">group_off</span>
                                <p className="mt-4 text-slate-500">Bu birimde henüz ekip üyesi yok</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
