		window.state = {
            members: {}, teams: {}, 
            monthData: { regular: {}, regular_notes: {}, betting: {}, expenses: {} },
            allFundsData: {}, globalSettings: { defaultFund: 100000 },
            adminProfile: { name: 'Quản lý', avatar: null }, // <-- THÊM DÒNG NÀY
            currentMonth: new Date().toISOString().slice(0, 7),
            activeTab: 'thu', currentFilter: 'all',
            bsMatchId: null 
        };
        // Hàm chuyển mã Hex sang RGBA để làm màu nền mờ
        function hexToRgba(hex, alpha) {
            let r = parseInt(hex.slice(1, 3), 16),
                g = parseInt(hex.slice(3, 5), 16),
                b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        document.getElementById('monthSelectorMain').value = window.state.currentMonth;
        document.getElementById('monthSelectorCompact').value = window.state.currentMonth;

        window.formatMoney = (val) => new Intl.NumberFormat('vi-VN').format(val || 0) + ' ₫';
        window.formatShortMoney = (val) => {
            const num = Number(val) || 0;
            if (num >= 1000 && num % 1000 === 0) return (num / 1000) + 'k';
            return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
        };
        window.getInitials = (name) => {
            if(!name) return '?';
            // Lấy từ cuối cùng của tên (Xóa khoảng trắng thừa)
            const words = name.trim().split(/\s+/); 
            return words.pop().charAt(0).toUpperCase();
        };
		// ================= HÀM XỬ LÝ DẤU CHẤM KHI NHẬP TIỀN =================
        window.formatInputMoney = (inputElement) => {
            // Lấy giá trị đang gõ, xóa hết mọi thứ không phải là số
            let val = inputElement.value.replace(/[^0-9]/g, ''); 
            if (val === '') { inputElement.value = ''; return; }
            
            // Ép thành số rồi format sang chuẩn Việt Nam (có dấu chấm)
            const number = parseInt(val, 10);
            inputElement.value = new Intl.NumberFormat('vi-VN').format(number);
        };

        // Hàm hỗ trợ: Lấy chuỗi có dấu chấm, biến ngược lại thành Số thực để lưu vào Firebase
        window.getRealNumber = (id) => {
            const el = document.getElementById(id);
            if(!el || !el.value) return 0;
            return Number(el.value.replace(/\./g, '')) || 0;
        };
        window.generateMatchNameFromDate = (dateStr) => {
            if(!dateStr) return '';
            const [y, m, d] = dateStr.split('-').map(Number);
            const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            const dayName = days[new Date(y, m - 1, d).getDay()];
            return `Tuần ${Math.ceil(d / 7)} - ${dayName} (${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')})`;
        };
        window.onMatchDateChange = () => {
            if(!document.getElementById('editMatchId').value || !document.getElementById('matchName').value.trim()) 
                document.getElementById('matchName').value = window.generateMatchNameFromDate(document.getElementById('matchDate').value);
        };

        function initApp() {
            db.ref('settings').on('value', (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    window.state.globalSettings.defaultFund = data.defaultFund || 100000;
                    if (data.adminProfile) window.state.adminProfile = data.adminProfile;
                }
                
                // Đã gỡ bỏ dòng lệnh tìm kiếm element 'displayDefaultFund' gây crash app
                
                window.renderAdminProfile(); // Vẽ Avatar Admin
                renderAll();
            });
            db.ref('teams').on('value', (snapshot) => {
                if (snapshot.exists()) window.state.teams = snapshot.val();
                else window.state.teams = {}; 
                updateTeamSelects(); renderAll();
                if(document.getElementById('modalMemberManager').classList.contains('show')) renderMemberManager();
            });
            db.ref('members').on('value', (snapshot) => {
                if (snapshot.exists()) window.state.members = snapshot.val();
                else window.state.members = {};
                fixOldMembersData();
                renderAll();
                if(document.getElementById('modalMemberManager').classList.contains('show')) renderMemberManager();
            });
            db.ref('funds').on('value', (snapshot) => {
                window.state.allFundsData = snapshot.exists() ? snapshot.val() : {};
                window.state.monthData = window.state.allFundsData[window.state.currentMonth] || { regular: {}, regular_notes: {}, betting: {}, expenses: {} };
                renderAll();
            });
        }

        function fixOldMembersData() {
            const teamEntries = Object.entries(window.state.teams);
            if(teamEntries.length === 0) return;

            let teamGiaId = null, teamTreId = null;
            teamEntries.forEach(([tId, t]) => {
                if(t.name.toLowerCase().includes('già')) teamGiaId = tId;
                if(t.name.toLowerCase().includes('trẻ')) teamTreId = tId;
            });
            const fallbackTeamId = teamEntries[0][0];

            let hasUpdates = false;
            const updates = {};

            Object.entries(window.state.members).forEach(([mId, m]) => {
                if(!m.teamId || !window.state.teams[m.teamId]) {
                    let targetId = fallbackTeamId;
                    if(m.team === 'Già' && teamGiaId) targetId = teamGiaId;
                    else if(m.team === 'Trẻ' && teamTreId) targetId = teamTreId;
                    
                    updates[`members/${mId}/teamId`] = targetId;
                    updates[`members/${mId}/team`] = null;
                    hasUpdates = true;
                }
            });
            if(hasUpdates) db.ref().update(updates);
        }

        function getCarryOverFund(targetMonthStr) {
            let prevTotal = 0;
            Object.keys(window.state.allFundsData).sort().forEach(mStr => {
                if (mStr < targetMonthStr) {
                    const mData = window.state.allFundsData[mStr];
                    let tQ = 0, tC = 0, tChi = 0;
                    Object.values(mData.regular || {}).forEach(a => tQ += (Number(a)||0));
                    Object.values(mData.betting || {}).forEach(m => Object.values(m.losers||{}).forEach(a => tC += (Number(a)||0)));
                    Object.values(mData.expenses || {}).forEach(e => {
                        if (e.type === 'thu') tQ += (Number(e.amount)||0); 
                        else tChi += (Number(e.amount)||0); 
                    });
                    
                    // 🔥 BỔ SUNG: Trừ tiền trích quỹ từ các bữa Liên Hoan của tháng cũ
                    Object.values(mData.parties || {}).forEach(p => {
                        tChi += (Number(p.fundAmount) || 0);
                    });

                    prevTotal += (tQ + tC - tChi);
                }
            }); return prevTotal;
        }

        function renderAll() { 
            renderThuQuy(); renderCaDo(); renderGiaoLuu(); 
            renderKyLuat(); renderLienHoan(); // <--- 2 DÒNG MỚI ĐỂ VẼ TAB
            renderChi(); renderTongKet(); renderThongKe();
            if(window.state.bsMatchId) renderBottomSheetContent(); 
            if(document.getElementById('bsParty').classList.contains('show')) window.openPartySheet(window.state.bsPartyId);
        }

        // ================= TAB 1: THU QUỸ =================
        window.setFilter = (type, index, el) => {
            window.state.currentFilter = type;
            document.querySelectorAll('.segmented-item').forEach(btn => btn.classList.remove('active'));
            el.classList.add('active'); 
            document.getElementById('seg-indicator').style.transform = `translateX(${index * 100}%)`;
            renderThuQuy();
        };

        window.renderThuQuy = () => {
            const container = document.getElementById('thu-container');
            const defaultFund = window.state.globalSettings.defaultFund || 100000;
            const filter = window.state.currentFilter;
            const searchKeyword = (document.getElementById('searchMemberInput')?.value || '').trim().toLowerCase();
            
            // 1. Quét toàn bộ nợ cũ của các tháng trước (Dùng undefined để kiểm tra thay vì <=0)
            let prevDebts = {};
            Object.keys(window.state.members).forEach(mId => prevDebts[mId] = 0);
            Object.keys(window.state.allFundsData).forEach(mStr => {
                if (mStr < window.state.currentMonth) {
                    const mData = window.state.allFundsData[mStr];
                    Object.entries(window.state.members).forEach(([mId, m]) => {
                        const rawPaid = mData.regular?.[mId];
                        if (rawPaid === undefined || rawPaid === null) prevDebts[mId] += defaultFund; // Nợ quỹ
                        Object.values(mData.betting || {}).forEach(match => {
                            const matchTotal = Number(match.penalty_amount) || 0;
                            if (match.losers && match.losers[mId] !== undefined) {
                                const bPaid = Number(match.losers[mId]) || 0;
                                if (bPaid < matchTotal) prevDebts[mId] += (matchTotal - bPaid); // Nợ độ
                            }
                        });
                    });
                }
            });

            let html = ''; let totalMembers = 0; let totalPaid = 0; let teamHtmls = ''; 
            
            Object.entries(window.state.teams).sort((a,b) => (a[1].order||0) - (b[1].order||0)).forEach(([tId, tData]) => {
                let unpaids = []; let paids = []; let tMoney = 0; let tCount = 0;
                
                Object.entries(window.state.members).forEach(([mId, m]) => {
                    if(m.teamId === tId) {
                        const rawPaid = window.state.monthData.regular?.[mId];
                        const isPaid = rawPaid !== undefined && rawPaid !== null; // Chìa khóa: 0đ vẫn là Đã Nộp
                        const paidAmt = Number(rawPaid) || 0;
                        const note = window.state.monthData.regular_notes?.[mId] || '';
                        
                        tCount++; totalMembers++;
                        if(searchKeyword && !m.name.toLowerCase().includes(searchKeyword)) return;
                        
                        const mObj = {id: mId, name: m.name, amt: paidAmt, isPaid: isPaid, note: note, avatar: m.avatar, oldDebt: prevDebts[mId]};
                        if(isPaid) { totalPaid++; tMoney += paidAmt; paids.push(mObj); } 
                        else unpaids.push(mObj);
                    }
                });

                if(unpaids.length > 0 || paids.length > 0) {
                    const dispUnpaid = (filter === 'all' || filter === 'unpaid') ? unpaids : [];
                    const dispPaid = (filter === 'all' || filter === 'paid') ? paids : [];

                    teamHtmls += `
                    <div class="d-flex justify-content-between align-items-end mt-4 mb-2 px-1">
                        <span class="fw-bold text-success text-uppercase border-start border-success border-4 ps-2">${tData.name}</span>
                        <small class="text-primary fw-bold bg-white px-2 py-1 rounded-pill shadow-sm">Tổng: ${window.formatMoney(tMoney)}</small>
                    </div>`;

                    const renderAvatar = (m) => {
                        let avt = m.avatar ? `<img src="${m.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : window.getInitials(m.name);
                        let debtBadge = m.oldDebt > 0 ? `<div class="debt-badge">Nợ ${window.formatShortMoney(m.oldDebt)}</div>` : '';
                        let editBadge = (m.isPaid && (m.note || m.amt !== defaultFund)) ? '<div class="avatar-badge-edit"><i class="fas fa-pen"></i></div>' : '';
                        let circleClass = m.isPaid ? 'avatar-paid' : 'avatar-unpaid';
                        let freeBadge = (m.isPaid && m.amt === 0) ? `<div class="bg-success text-white px-2 rounded-pill mt-1" style="font-size: 8.5px; font-weight: 800;">Miễn phí</div>` : '';
                        
                        return `<div class="avatar-item" onclick="openCustomFund('${m.id}', '${m.name}', ${m.isPaid}, ${m.amt}, ${defaultFund})">
                                    <div class="avatar-circle ${circleClass}">${avt}${editBadge}${debtBadge}</div>
                                    <span class="avatar-name">${m.name}</span>
                                    ${freeBadge}
                                </div>`;
                    };

                    if(dispUnpaid.length > 0) {
                        teamHtmls += `<div class="avatar-grid">`;
                        dispUnpaid.forEach(m => teamHtmls += renderAvatar(m));
                        teamHtmls += `</div>`;
                    }
                    if(dispPaid.length > 0) {
                        if(filter === 'paid' || searchKeyword) {
                            teamHtmls += `<div class="avatar-grid">`;
                            dispPaid.forEach(m => teamHtmls += renderAvatar(m));
                            teamHtmls += `</div>`;
                        } else {
                            teamHtmls += `
                            <div class="bg-white rounded-3 p-2 text-center text-muted fw-bold small shadow-sm mb-3" style="cursor:pointer;" onclick="this.nextElementSibling.classList.toggle('d-none');">
                                <i class="fas fa-check-circle text-success me-1"></i> Đã nộp (${dispPaid.length} người) <i class="fas fa-chevron-down ms-1"></i>
                            </div>
                            <div class="avatar-grid d-none">`;
                            dispPaid.forEach(m => teamHtmls += renderAvatar(m));
                            teamHtmls += `</div>`;
                        }
                    }
                }
            });

            let percent = totalMembers > 0 ? Math.round((totalPaid / totalMembers) * 100) : 0;
            html += `
            <div class="fund-progress-container">
                <div class="d-flex justify-content-between align-items-end mb-1">
                    <span class="fw-bold text-dark" style="font-size: 13px;"><i class="fas fa-flag-checkered text-success me-1"></i>Tiến độ thu quỹ tháng</span>
                    <span class="text-success fw-black">${totalPaid}/${totalMembers} người</span>
                </div>
                <div class="fund-progress-bar shadow-inner">
                    <div class="fund-progress-fill" style="width: ${percent}%;"></div>
                </div>
            </div>`;

            document.getElementById('thu-summary-badge').innerText = `${percent}% Hoàn thành`;
            container.innerHTML = html + (teamHtmls || '<div class="text-center text-muted mt-5">Không có dữ liệu.</div>');
        };

        window.openCustomFund = (mId, mName, isPaid, currentPaid, defaultFund) => {
            document.getElementById('customFundMemId').value = mId; 
            document.getElementById('customFundMemName').innerText = mName;
            
            const amtInput = document.getElementById('inputCustomFund');
            const noteInput = document.getElementById('inputCustomNote');
            const btnQuick = document.getElementById('btnQuickCollect');
            const btnCancel = document.getElementById('btnCancelFund');
            const divider = document.getElementById('cfDivider');
            
            document.getElementById('quickFundAmount').innerText = window.formatShortMoney(defaultFund);
            noteInput.value = window.state.monthData.regular_notes?.[mId] || '';
            
            if (isPaid) {
                btnQuick.style.display = 'none';
                divider.style.display = 'none';
                btnCancel.style.display = 'block';
                amtInput.value = new Intl.NumberFormat('vi-VN').format(currentPaid);
                document.getElementById('cfModalTitle').innerHTML = '<i class="fas fa-edit me-2"></i>Sửa Khoản Thu';
            } else {
                btnQuick.style.display = 'block';
                divider.style.display = 'flex';
                btnCancel.style.display = 'none';
                amtInput.value = new Intl.NumberFormat('vi-VN').format(defaultFund);
                document.getElementById('cfModalTitle').innerHTML = '<i class="fas fa-wallet me-2"></i>Thu Quỹ';
            }
            new bootstrap.Modal(document.getElementById('modalCustomFund')).show();
        };

        window.quickCollectFund = () => {
            const mId = document.getElementById('customFundMemId').value;
            const defaultFund = window.state.globalSettings.defaultFund || 100000;
            db.ref(`funds/${window.state.currentMonth}/regular/${mId}`).set(defaultFund)
                .then(() => bootstrap.Modal.getInstance(document.getElementById('modalCustomFund')).hide());
        };

        window.saveCustomFund = () => {
            const mId = document.getElementById('customFundMemId').value;
            const amtStr = document.getElementById('inputCustomFund').value.trim();
            const amt = window.getRealNumber('inputCustomFund');
            const note = document.getElementById('inputCustomNote').value.trim();
            
            if(amtStr !== "") { // Cho phép người dùng gõ số 0
                db.ref().update({
                    [`funds/${window.state.currentMonth}/regular/${mId}`]: amt,
                    [`funds/${window.state.currentMonth}/regular_notes/${mId}`]: note || null
                }).then(() => bootstrap.Modal.getInstance(document.getElementById('modalCustomFund')).hide());
            } else {
                alert("Vui lòng nhập số tiền hợp lệ (có thể là 0)!");
            }
        };

        window.cancelFund = () => {
            const mId = document.getElementById('customFundMemId').value;
            if(confirm('Xác nhận HỦY khoản thu của thành viên này?')) {
                db.ref().update({
                    [`funds/${window.state.currentMonth}/regular/${mId}`]: null,
                    [`funds/${window.state.currentMonth}/regular_notes/${mId}`]: null
                }).then(() => bootstrap.Modal.getInstance(document.getElementById('modalCustomFund')).hide());
            }
        };

        // ================= TAB 2: CÁ ĐỘ & KẾT QUẢ =================
        function renderCaDo() {
            const container = document.getElementById('cado-container'); 
            const betting = window.state.monthData.betting || {};
            const matchKeys = Object.keys(betting);

            let totalCollected = 0;
            let totalDebt = 0;

            const matchesList = Object.entries(betting).map(([mId, m]) => {
                const total = Number(m.penalty_amount) || 0;
                let col = 0; const losers = m.losers || {};
                const count = Object.keys(losers).length;
                Object.values(losers).forEach(a => col += (Number(a)||0));
                const debt = Math.max(0, (count * total) - col);
                totalCollected += col;
                totalDebt += debt;
                return { id: mId, ...m, total, count, debt, isDone: (count > 0 && debt <= 0) };
            }).sort((a,b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));

            document.getElementById('cado-thu-header').innerText = window.formatMoney(totalCollected);
            document.getElementById('cado-sub-header').innerText = `${matchKeys.length} trận • Nợ: ${window.formatShortMoney(totalDebt)}`;

            if(matchKeys.length === 0) {
                container.innerHTML = '<div class="card-clean border p-4 text-center text-muted small"><i class="fas fa-futbol fa-2x mb-2 opacity-25"></i><br>Chưa có trận đấu nội bộ nào trong tháng.</div>';
                return;
            }

            let html = '';
            matchesList.forEach(m => {
                let statusHtml = m.count === 0 ? `<span class="status-debt bg-secondary text-white">Chưa cập nhật KQ</span>` 
                               : m.debt > 0 ? `<span class="status-debt">Nợ: ${window.formatShortMoney(m.debt)}</span>` 
                               : `<span class="status-done"><i class="fas fa-check"></i> Đã thu xong</span>`;

                html += `
                <div class="match-card ${m.isDone ? 'completed' : ''}" onclick="openMatchSheet('${m.id}')">
                    <div class="flex-grow-1 text-truncate pe-2">
                        <div class="match-title text-truncate">${m.name}</div>
                        <div class="match-date"><i class="far fa-calendar-alt text-success me-1"></i>${m.date ? new Date(m.date).toLocaleDateString('vi-VN') : '---'}</div>
                    </div>
                    <div class="text-end flex-shrink-0">
                        <div class="match-status mb-1">${statusHtml}</div>
                        <span class="badge bg-light text-secondary border shadow-sm">${window.formatShortMoney(m.total)} / thua</span>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        window.openMatchSheet = (matchId) => {
            window.state.bsMatchId = matchId;
            document.getElementById('bsOverlay').classList.add('show');
            document.getElementById('bsMatch').classList.add('show');
            renderBottomSheetContent();
        };
        window.closeMatchSheet = () => {
            window.state.bsMatchId = null;
            document.getElementById('bsOverlay').classList.remove('show');
            document.getElementById('bsMatch').classList.remove('show');
			document.getElementById('bsParty')?.classList.remove('show');
        };
        window.deleteMatchFromSheet = () => {
            if(confirm("Xóa toàn bộ dữ liệu trận đấu này?")) {
                db.ref(`funds/${window.state.currentMonth}/betting/${window.state.bsMatchId}`).remove();
                closeMatchSheet();
            }
        };

        function renderBottomSheetContent() {
            const matchId = window.state.bsMatchId; if(!matchId) return;
            const match = window.state.monthData.betting?.[matchId]; if(!match) return closeMatchSheet();

            const matchTotal = Number(match.penalty_amount) || 0;
            const losers = match.losers || {};
            const loserIds = Object.keys(losers);
            let debtTotal = 0;

            document.getElementById('bsMatchTitle').innerText = match.name;
            document.getElementById('bsMatchDate').innerText = match.date ? new Date(match.date).toLocaleDateString('vi-VN') : '';
            document.getElementById('bsMatchPenalty').innerText = `Tiền độ: ${window.formatShortMoney(matchTotal)}`;

            let html = '<div class="card-clean border">';
            if(loserIds.length === 0) {
                html += `<div class="p-4 text-center text-muted fw-bold">Chưa cập nhật kết quả trận này.<br><small class="fw-normal">Bấm "Cập nhật Kết Quả" để đánh dấu Thắng/Thua.</small></div>`;
            } else {
                Object.entries(window.state.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([tId, t]) => {
                    let teamHtml = '';
                    loserIds.forEach(mId => {
                        const m = window.state.members[mId];
                        if(m && m.teamId === tId) {
                            const paidAmt = Number(losers[mId]) || 0;
                            const isPaid = paidAmt >= matchTotal;
                            if(!isPaid) debtTotal += (matchTotal - paidAmt);

                            teamHtml += `
                            <div class="bg-white rounded-3 mb-2 shadow-sm border d-flex justify-content-between align-items-center p-2" style="border-left: 4px solid ${isPaid ? '#198754' : '#dc3545'} !important; transition: all 0.2s;">
                                <div class="d-flex align-items-center gap-2 ps-1" style="min-width: 0;">
                                    <div class="fw-bold ${isPaid ? 'text-muted text-decoration-line-through' : 'text-dark'} text-truncate" style="font-size: 14.5px;">
                                        ${m.name}
                                    </div>
                                </div>
                                <!-- Nút bấm Toggle trạng thái chống bấm nhầm -->
                                <button class="btn btn-sm rounded-3 fw-bold d-flex align-items-center gap-1 shadow-sm flex-shrink-0" 
                                        onclick="toggleBettingStatus('${matchId}', '${mId}', ${matchTotal}, ${isPaid})"
                                        style="background: ${isPaid ? '#e8f5e9' : '#fff5f5'}; color: ${isPaid ? '#198754' : '#dc3545'}; border: 1px solid ${isPaid ? '#badbcc' : '#ffc9c9'}; padding: 6px 12px; font-size: 12px;">
                                    <i class="fas ${isPaid ? 'fa-check-circle' : 'fa-times-circle'}"></i> 
                                    ${isPaid ? 'Đã thu' : 'Chưa thu'}
                                </button>
                            </div>`;
                        }
                    });
                    if(teamHtml) html += `<div class="bg-light px-3 py-1 fw-bold small text-muted border-bottom">${t.name}</div>` + teamHtml;
                });
            }
            html += '</div>';
            document.getElementById('bsMatchContent').innerHTML = html;
            
            const badgeDebt = document.getElementById('bsMatchDebt');
            if(debtTotal > 0) { badgeDebt.className = 'badge bg-danger rounded-pill fs-6 shadow-sm'; badgeDebt.innerText = 'Cần thu: ' + window.formatShortMoney(debtTotal); }
            else if(loserIds.length > 0) { badgeDebt.className = 'badge bg-success rounded-pill fs-6 shadow-sm'; badgeDebt.innerHTML = '<i class="fas fa-check"></i> Đã thu đủ'; }
            else { badgeDebt.className = 'badge bg-secondary rounded-pill fs-6'; badgeDebt.innerHTML = 'Trống'; }
        }

        window.toggleBettingStatus = (matchId, mId, matchTotal, isPaid) => {
            db.ref(`funds/${window.state.currentMonth}/betting/${matchId}/losers/${mId}`).set(isPaid ? 0 : matchTotal);
        };

        window.renderMatchResultsSelection = (winners = {}, losers = {}) => {
            let html = '';
            Object.entries(window.state.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([tId, t]) => {
                html += `<div class="small fw-bold text-primary mt-3 mb-1 px-1 text-uppercase">${t.name}</div>`;
                Object.entries(window.state.members).forEach(([mId, m]) => {
                    if(m.teamId === tId) {
                        const isWin = winners[mId] !== undefined;
                        const isLose = losers[mId] !== undefined;
                        const isSkip = !isWin && !isLose;
                        
                        html += `
                        <div class="d-flex justify-content-between align-items-center border-bottom bg-white px-2 py-2">
                            <span class="fw-bold text-dark text-truncate pe-2" style="font-size:14px;">${m.name}</span>
                            <div class="result-selector flex-shrink-0" style="width: 170px;">
                                <input type="radio" name="res_${mId}" id="win_${mId}" value="win" class="res-radio" data-mid="${mId}" ${isWin ? 'checked' : ''}>
                                <label for="win_${mId}">Thắng</label>
                                <input type="radio" name="res_${mId}" id="skip_${mId}" value="skip" class="res-radio" data-mid="${mId}" ${isSkip ? 'checked' : ''}>
                                <label for="skip_${mId}">Nghỉ</label>
                                <input type="radio" name="res_${mId}" id="lose_${mId}" value="lose" class="res-radio" data-mid="${mId}" ${isLose ? 'checked' : ''}>
                                <label for="lose_${mId}">Thua</label>
                            </div>
                        </div>`;
                    }
                });
            });
            document.getElementById('match-results-container').innerHTML = html;
        };

       window.openAddMatchModal = () => {
            document.getElementById('editMatchId').value = '';
            document.getElementById('matchModalTitle').innerHTML = '<i class="fas fa-trophy me-2"></i>Tạo Trận & Kết Quả';
            const todayStr = new Date().toISOString().slice(0, 10);
            document.getElementById('matchDate').value = todayStr;
            document.getElementById('matchName').value = window.generateMatchNameFromDate(todayStr);
            document.getElementById('matchPenalty').value = '0';
            window.renderMatchResultsSelection({}, {});
            new bootstrap.Modal(document.getElementById('modalMatch')).show();
        };

        window.openEditMatchResults = () => {
            const matchId = window.state.bsMatchId;
            const match = window.state.monthData.betting?.[matchId]; if(!match) return;
            document.getElementById('editMatchId').value = matchId;
            document.getElementById('matchModalTitle').innerHTML = '<i class="fas fa-trophy me-2"></i>Cập nhật Kết Quả';
            document.getElementById('matchDate').value = match.date || '';
            document.getElementById('matchName').value = match.name || '';
            document.getElementById('matchPenalty').value = match.penalty_amount || 0;
            window.renderMatchResultsSelection(match.winners || {}, match.losers || {});
            
            closeMatchSheet();
            new bootstrap.Modal(document.getElementById('modalMatch')).show();
        };

        window.saveMatch = () => {
            const editId = document.getElementById('editMatchId').value;
            const name = document.getElementById('matchName').value.trim(); 
            const date = document.getElementById('matchDate').value; 
            const penalty = window.getRealNumber('matchPenalty');
            
            if(!name) return alert("Vui lòng nhập tên trận đấu!");
            
            const newWinners = {};
            const newLosers = {};
            
            document.querySelectorAll('.res-radio:checked').forEach(radio => {
                const mId = radio.getAttribute('data-mid');
                if(radio.value === 'win') newWinners[mId] = true;
                else if(radio.value === 'lose') newLosers[mId] = 0; 
            });

            if(editId) {
                const oldMatch = window.state.monthData.betting?.[editId] || {};
                const oldLosers = oldMatch.losers || {};
                Object.keys(newLosers).forEach(mId => {
                    if(oldLosers[mId] !== undefined) newLosers[mId] = oldLosers[mId] >= penalty ? penalty : oldLosers[mId];
                });
                db.ref(`funds/${window.state.currentMonth}/betting/${editId}`).update({ name, date, penalty_amount: penalty, winners: newWinners, losers: newLosers })
                .then(() => bootstrap.Modal.getInstance(document.getElementById('modalMatch')).hide());
            } else {
                db.ref(`funds/${window.state.currentMonth}/betting`).push({ name, date, penalty_amount: penalty, winners: newWinners, losers: newLosers })
                .then(() => bootstrap.Modal.getInstance(document.getElementById('modalMatch')).hide());
            }
        };

        // ================= CÁC TAB GIAO LƯU / CÁ ĐỘ / KỶ LUẬT / LIÊN HOAN =================
        window.state.cadoSubTab = 'giaoluu'; 

        window.switchCadoSubTab = (subTab) => {
            window.state.cadoSubTab = subTab;
            const tabs = ['giaoluu', 'cado', 'kyluat', 'lienhoan'];
            const fab = document.getElementById('globalFabBtn');

            tabs.forEach(t => {
                const viewEl = document.getElementById(`subtab-${t}-view`);
                const cardEl = document.getElementById(`card-sub-${t}`);
                if (viewEl) viewEl.classList.add('d-none');
                if (cardEl) cardEl.classList.remove(`active-${t}`);
            });

            const activeView = document.getElementById(`subtab-${subTab}-view`);
            const activeCard = document.getElementById(`card-sub-${subTab}`);
            if (activeView) activeView.classList.remove('d-none');
            if (activeCard) activeCard.classList.add(`active-${subTab}`);

            if (window.state.activeTab === 'cado' && fab) {
                fab.className = 'fab-btn show ' + (subTab === 'giaoluu' ? 'bg-primary' : (subTab === 'kyluat' ? 'bg-warning' : (subTab === 'lienhoan' ? 'bg-info' : 'bg-success')));
            }
        };

        // --- GIAO LƯU & THU KHÁC (Phiên bản cũ) ---
        window.openAddIncomeModal = () => {
            document.getElementById('editIncId').value = ''; 
            document.getElementById('incModalTitle').innerHTML = '<i class="fas fa-plus-circle me-2"></i>Thêm Tiền Giao Lưu & Thu Khác';
            document.getElementById('incDesc').value = ''; 
            document.getElementById('incAmount').value = '';
            document.getElementById('incDate').value = new Date().toISOString().slice(0, 10);
            new bootstrap.Modal(document.getElementById('modalIncome')).show();
        };

        window.openEditIncomeModal = (incId) => {
            const inc = window.state.monthData.expenses?.[incId]; if(!inc) return;
            document.getElementById('editIncId').value = incId; 
            document.getElementById('incModalTitle').innerHTML = '<i class="fas fa-edit me-2"></i>Sửa Khoản Thu';
            document.getElementById('incDesc').value = inc.desc || ''; 
            document.getElementById('incAmount').value = inc.amount || '';
            document.getElementById('incDate').value = inc.rawDate || new Date().toISOString().slice(0, 10);
            new bootstrap.Modal(document.getElementById('modalIncome')).show();
        };

        window.saveIncome = () => {
            const editId = document.getElementById('editIncId').value;
            const desc = document.getElementById('incDesc').value.trim(); 
            const amt = window.getRealNumber('incAmount');
            const rawDate = document.getElementById('incDate').value;
            
            if(!desc || !amt) return alert("Vui lòng nhập nội dung và số tiền thu!"); 
            const payload = { desc, amount: amt, type: 'thu', date: rawDate ? new Date(rawDate).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'), rawDate };
            
            if(editId) db.ref(`funds/${window.state.currentMonth}/expenses/${editId}`).update(payload).then(() => bootstrap.Modal.getInstance(document.getElementById('modalIncome')).hide());
            else db.ref(`funds/${window.state.currentMonth}/expenses`).push(payload).then(() => bootstrap.Modal.getInstance(document.getElementById('modalIncome')).hide());
        };

        window.deleteIncome = (incId) => {
            if(confirm('Xóa khoản thu giao lưu này?')) {
                db.ref(`funds/${window.state.currentMonth}/expenses/${incId}`).remove();
            }
        };

        function renderGiaoLuu() {
            const container = document.getElementById('giaoluu-container');
            if(!container) return;
            const allItems = window.state.monthData.expenses || {};
            const incEntries = Object.entries(allItems).filter(([_, item]) => item.type === 'thu');
            
            let totalInc = 0;
            incEntries.forEach(([_, inc]) => totalInc += (Number(inc.amount) || 0));

            const headerEl = document.getElementById('giaoluu-thu-header');
            const subEl = document.getElementById('giaoluu-sub-header');
            if (headerEl) headerEl.innerText = window.formatMoney(totalInc);
            if (subEl) subEl.innerText = `${incEntries.length} khoản thu`;

            if(incEntries.length === 0) {
                container.innerHTML = '<div class="card-clean border p-4 text-center text-muted small"><i class="fas fa-handshake fa-2x mb-2 opacity-25"></i><br>Chưa có khoản thu giao lưu & thu khác.<br>Bấm (+) để thêm.</div>';
                return;
            }

            let html = '<div class="timeline-container">';
            incEntries.sort((a,b) => new Date(b[1].rawDate || 0) - new Date(a[1].rawDate || 0)).forEach(([incId, inc]) => {
                let iconClass = 'icon-khac'; let iconItem = 'fa-handshake';
                const descLower = inc.desc.toLowerCase();
                if(descLower.includes('sân')) { iconClass = 'icon-san'; iconItem = 'fa-futbol'; }
                else if(descLower.includes('nước')) { iconClass = 'icon-nuoc'; iconItem = 'fa-tint'; }
                else if(descLower.includes('thưởng') || descLower.includes('giải')) { iconClass = 'icon-thuong'; iconItem = 'fa-trophy'; }
                else if(descLower.includes('tài trợ')) { iconClass = 'icon-khac'; iconItem = 'fa-gem'; }

                html += `
                <div class="timeline-item">
                    <div class="timeline-icon ${iconClass}"><i class="fas ${iconItem}"></i></div>
                    <div class="timeline-content">
                        <div class="timeline-title">${inc.desc}</div>
                        <div class="timeline-date"><i class="far fa-calendar-check"></i> ${inc.date}</div>
                        <div class="timeline-actions">
                            <div class="tl-btn edit" onclick="openEditIncomeModal('${incId}')"><i class="fas fa-pen"></i></div>
                            <div class="tl-btn delete" onclick="deleteIncome('${incId}')"><i class="fas fa-trash"></i></div>
                        </div>
                    </div>
                    <div class="timeline-amount">+${window.formatShortMoney(inc.amount)}</div>
                </div>`;
            });
            container.innerHTML = html + '</div>';
        }

        // --- 2. KỶ LUẬT (PHẠT THEO NGÀY TÙY CHỌN) ---
        // --- Cập nhật giao diện Modal Phạt ---
        window.openAddPenaltyModal = () => {
			document.getElementById('editPenaltyId').value = '';              // ← RESET Edit ID
			document.getElementById('penDesc').value = ''; 
			document.getElementById('penAmount').value = '20.000';
			document.getElementById('penDate').value = new Date().toISOString().slice(0, 10);
			document.getElementById('penaltyModalTitle').innerHTML = '<i class="fas fa-gavel me-2"></i>Kỷ Luật Cầu Thủ';  // ← Đổi tiêu đề
			document.getElementById('btnSavePenalty').innerHTML = 'LƯU BIÊN BẢN';  // ← Đổi nút

			let chkHtml = '<div class="row g-2 m-0 px-2 pb-4">';
			Object.entries(window.state.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([tId, t]) => {
				chkHtml += `<div class="col-12 mt-3 mb-1"><span class="badge bg-secondary bg-opacity-10 text-dark border shadow-sm px-3 py-2 rounded-pill"><i class="fas fa-shield-alt text-warning me-1"></i>${t.name}</span></div>`;
				Object.entries(window.state.members).forEach(([mId, m]) => {
					if(m.teamId === tId) {
						chkHtml += `
						<div class="col-6">
							<input class="mem-select-cb penalty-checkbox" type="checkbox" value="${mId}" id="pen_chk_${mId}">
							<label class="mem-select-label" for="pen_chk_${mId}"><i class="fas fa-user-times me-2 opacity-25"></i>${m.name}</label>
						</div>`;
					}
				});
			});
			chkHtml += '</div>';
			document.getElementById('penalty-members-container').innerHTML = chkHtml;
			new bootstrap.Modal(document.getElementById('modalPenalty')).show();
		};
		// 🔥 HÀM MỚI 1: Toggle đã thu / chưa thu tiền phạt
		window.togglePenaltyStatus = (pId, currentIsPaid) => {
			const newStatus = !currentIsPaid;
			db.ref(`funds/${window.state.currentMonth}/penalties/${pId}`)
				.update({ isPaid: newStatus })
				.catch(err => alert('Lỗi cập nhật: ' + err.message));
		};

		// 🔥 HÀM MỚI 2: Xóa biên bản phạt
		window.deletePenalty = (pId) => {
			if (confirm('Xóa biên bản phạt này? Không thể hoàn tác!')) {
				db.ref(`funds/${window.state.currentMonth}/penalties/${pId}`)
					.remove()
					.catch(err => alert('Lỗi xóa: ' + err.message));
			}
		};

		// 🔥 HÀM MỚI 3: Mở modal sửa biên bản phạt
		window.openEditPenalty = (pId) => {
			const p = window.state.monthData.penalties?.[pId];
			if (!p) return;

			document.getElementById('editPenaltyId').value = pId;
			document.getElementById('penDate').value = p.customDate || new Date().toISOString().slice(0, 10);
			document.getElementById('penAmount').value = new Intl.NumberFormat('vi-VN').format(p.amount || 0);
			document.getElementById('penDesc').value = p.reason || '';
			document.getElementById('penaltyModalTitle').innerHTML = '<i class="fas fa-edit me-2"></i>Sửa Biên Bản Phạt';
			document.getElementById('btnSavePenalty').innerHTML = 'CẬP NHẬT BIÊN BẢN';

			// Hiển thị thông tin người vi phạm (không cho đổi người khi sửa)
			const memName = window.state.members[p.memberId]?.name || 'Không rõ';
			document.getElementById('penalty-members-container').innerHTML = `
				<div class="p-4 text-center text-muted">
					<i class="fas fa-user-lock fa-2x mb-2 text-warning opacity-50"></i><br>
					Đang sửa biên bản của: <strong class="text-dark">${memName}</strong>
					<div class="small mt-2 fst-italic">(Không thể thay đổi người vi phạm — chỉ sửa số tiền, lý do, ngày)</div>
				</div>`;

			new bootstrap.Modal(document.getElementById('modalPenalty')).show();
		};
        window.savePenalty = () => {
			const editId = document.getElementById('editPenaltyId').value;   // ← PHÂN BIỆT EDIT/CREATE
			const rawDate = document.getElementById('penDate').value;
			const desc = document.getElementById('penDesc').value.trim(); 
			const amt = window.getRealNumber('penAmount');
			
			if(!desc || amt <= 0) return alert("Vui lòng nhập lý do phạt và số tiền hợp lệ!");
			if(!rawDate) return alert("Vui lòng chọn ngày vi phạm!");

			const displayDate = new Date(rawDate).toLocaleDateString('vi-VN');

			// ---- CHẾ ĐỘ SỬA ----
			if (editId) {
				db.ref(`funds/${window.state.currentMonth}/penalties/${editId}`).update({
					customDate: rawDate,
					reason: desc,
					amount: amt,
					date: displayDate
				}).then(() => {
					const modalEl = document.getElementById('modalPenalty');
					const modalInst = bootstrap.Modal.getInstance(modalEl);
					if (modalInst) modalInst.hide();
				});
				return;
			}

			// ---- CHẾ ĐỘ TẠO MỚI ----
			const checkedBoxes = document.querySelectorAll('.penalty-checkbox:checked');
			if(checkedBoxes.length === 0) return alert("Vui lòng chọn ít nhất 1 cầu thủ vi phạm!");

			const updates = {};
			checkedBoxes.forEach(chk => {
				const mId = chk.value;
				const newRef = db.ref(`funds/${window.state.currentMonth}/penalties`).push();
				updates[newRef.key] = { 
					memberId: mId, 
					customDate: rawDate, 
					reason: desc, 
					amount: amt, 
					isPaid: false, 
					date: displayDate 
				};
			});

			db.ref(`funds/${window.state.currentMonth}/penalties`).update(updates).then(() => {
				const modalEl = document.getElementById('modalPenalty');
				const modalInst = bootstrap.Modal.getInstance(modalEl);
				if (modalInst) modalInst.hide();
			});
		};
		// 🔥 HÀM MỚI: Xổ xuống / Thu gọn thẻ Phạt
        window.togglePenaltyExpand = (el) => {
            const actions = el.nextElementSibling; // Lấy khối div chứa nút bấm bên dưới
            const chevron = el.querySelector('.penalty-chevron'); // Lấy icon mũi tên
            
            if (actions.classList.contains('d-none')) {
                actions.classList.remove('d-none');
                if (chevron) {
                    chevron.classList.remove('fa-chevron-down');
                    chevron.classList.add('fa-chevron-up');
                    chevron.style.transform = 'rotate(180deg)';
                }
            } else {
                actions.classList.add('d-none');
                if (chevron) {
                    chevron.classList.remove('fa-chevron-up');
                    chevron.classList.add('fa-chevron-down');
                    chevron.style.transform = 'rotate(0deg)';
                }
            }
        };
        function renderKyLuat() {
			const container = document.getElementById('kyluat-container'); if(!container) return;
			const pens = window.state.monthData.penalties || {};
			
			let totalNo = 0; let totalThu = 0; let totalPhat = 0;
			const grouped = {};

			Object.entries(pens).forEach(([pId, p]) => {
				totalPhat++;
				if(!p.isPaid) totalNo += (Number(p.amount) || 0);
				else totalThu += (Number(p.amount) || 0);

				const groupKey = p.customDate || p.date || 'Khác';
				const groupTitle = 'Ngày ' + (p.date || '---');

				if (!grouped[groupKey]) {
					grouped[groupKey] = { title: groupTitle, rawDate: p.customDate || p.date || '', items: [] };
				}
				grouped[groupKey].items.push({ pId, ...p });
			});

			let html = '';
			const sortedGroups = Object.values(grouped).sort((a,b) => new Date(b.rawDate || 0) - new Date(a.rawDate || 0));

			sortedGroups.forEach(group => {
				// Header "Ngày ..." của nhóm
				html += `
				<div class="d-flex align-items-center mb-2 mt-4 px-1">
					<span class="badge bg-secondary bg-opacity-10 text-dark border shadow-sm px-3 py-2 rounded-pill">
						<i class="far fa-calendar-alt text-warning me-2"></i>${group.title}
					</span>
				</div>
				<div>`;

				 // Loop qua từng biên bản trong nhóm
				group.items.forEach(p => {
					const memName = window.state.members[p.memberId]?.name || 'Không rõ';
					const statusColor = p.isPaid ? '#adb5bd' : '#fd7e14'; // Xám nếu đã thu, Cam nếu chưa
					const dotColor = p.isPaid ? 'bg-secondary' : 'bg-danger';
					
					html += `
					<div class="bg-white rounded-3 mb-2 shadow-sm border" style="border-left: 4px solid ${statusColor} !important; overflow: hidden;">
						
						<!-- KHU VỰC TIÊU ĐỀ (LUÔN HIỂN THỊ - BẤM VÀO ĐỂ XỔ XUỐNG) -->
						<div class="d-flex justify-content-between align-items-center p-3" onclick="togglePenaltyExpand(this)" style="cursor: pointer; user-select: none; background: ${p.isPaid ? '#f8f9fa' : '#ffffff'};">
							<div class="d-flex align-items-center gap-2 flex-grow-1" style="min-width: 0;">
								<div class="${dotColor}" style="width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;"></div>
								<div class="fw-bold ${p.isPaid ? 'text-muted text-decoration-line-through' : 'text-dark'} text-truncate" style="font-size: 15px;">
									${memName}
								</div>
							</div>
							<div class="d-flex align-items-center gap-3 flex-shrink-0">
								<span class="fw-black ${p.isPaid ? 'text-muted' : 'text-danger'}" style="font-size: 15px;">
									${window.formatShortMoney(p.amount)}
								</span>
								<i class="fas fa-chevron-down text-muted penalty-chevron" style="font-size: 12px; transition: transform 0.3s;"></i>
							</div>
						</div>

						<!-- KHU VỰC XỔ XUỐNG (ẨN MẶC ĐỊNH - CHỨA LÝ DO VÀ NÚT BẤM) -->
						<div class="d-none bg-light border-top p-3">
							<div class="mb-3 d-flex align-items-start gap-2">
								<i class="fas fa-info-circle text-warning mt-1" style="font-size: 14px;"></i>
								<div>
									<div class="text-muted small fw-bold" style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px;">Lý do vi phạm</div>
									<div class="text-dark fw-bold" style="font-size: 13.5px;">${p.reason}</div>
								</div>
							</div>
							
							<div class="d-flex gap-2">
								<!-- Nút Toggle Đã Thu / Chưa Thu (To rõ, chống bấm nhầm) -->
								<button class="btn btn-sm w-100 fw-bold shadow-sm py-2" onclick="togglePenaltyStatus('${p.pId}', ${p.isPaid})" style="background: ${p.isPaid ? '#ffffff' : '#198754'}; color: ${p.isPaid ? '#6c757d' : '#ffffff'}; border: 1px solid ${p.isPaid ? '#ced4da' : '#198754'}; border-radius: 8px;">
									${p.isPaid ? '<i class="fas fa-undo me-1"></i> Hủy Trạng Thái Đã Thu' : '<i class="fas fa-check-circle me-1"></i> Xác Nhận Đã Thu Tiền'}
								</button>
								
								<!-- Nút Sửa -->
								<button class="btn btn-sm btn-light border text-primary shadow-sm" style="width: 45px; border-radius: 8px;" onclick="event.stopPropagation(); openEditPenalty('${p.pId}')" title="Sửa">
									<i class="fas fa-pen"></i>
								</button>
								
								<!-- Nút Xóa -->
								<button class="btn btn-sm btn-light border text-danger shadow-sm" style="width: 45px; border-radius: 8px;" onclick="event.stopPropagation(); deletePenalty('${p.pId}')" title="Xóa">
									<i class="fas fa-trash"></i>
								</button>
							</div>
						</div>
						
					</div>`;
				});

				html += `</div>`;   // đóng wrapper của group
			});                     // đóng sortedGroups.forEach — CHỈ 1 DẤU });

			container.innerHTML = html !== '' ? html : '<div class="card-clean border p-4 text-center text-muted small"><i class="fas fa-gavel fa-2x mb-3 text-warning opacity-50"></i><br>Đội bóng gương mẫu, chưa ai bị phạt!</div>';
			
			const headerEl = document.getElementById('kyluat-thu-header');
			const subEl = document.getElementById('kyluat-sub-header');
			if (headerEl) headerEl.innerText = window.formatMoney(totalThu);
			if (subEl) subEl.innerText = `${totalPhat} lỗi • Nợ: ${window.formatShortMoney(totalNo)}`;
		}

        // ================= HÀM TÍNH TIỀN CHIA ĐỀU (ĐÃ ĐƯỢC KHÔI PHỤC) =================
        // Biến toàn cục lưu mảng ảnh hóa đơn
        window.tempPartyBills = []; 

        window.togglePartyFund = () => {
            const isFund = document.getElementById('ptFund').checked;
            const fundWrap = document.getElementById('partyFundWrap');
            if (isFund) {
                fundWrap.style.opacity = '1';
                fundWrap.style.pointerEvents = 'auto';
            } else {
                fundWrap.style.opacity = '0.4';
                fundWrap.style.pointerEvents = 'none';
                document.getElementById('partyFundAmount').value = '0';
            }
            window.calculatePartySplit();
        };

        window.calculatePartySplit = () => {
            const bill = window.getRealNumber('partyTotalBill');
            const fundAmt = window.getRealNumber('partyFundAmount');
            const checks = document.querySelectorAll('.party-checkbox:checked').length;
            
            let remaining = bill - fundAmt;
            if (remaining < 0) remaining = 0; // Không thể âm tiền

            const perPerson = checks > 0 ? Math.ceil(remaining / checks) : 0;
            const perPersonEl = document.getElementById('partyPerPerson');
            if(perPersonEl) perPersonEl.innerText = window.formatMoney(perPerson);
            return perPerson;
        };

        window.openAddPartyModal = () => {
            document.getElementById('editPartyId').value = ''; 
            document.getElementById('partyName').value = ''; 
            document.getElementById('partyTotalBill').value = '0';
            document.getElementById('partyFundAmount').value = '0';
            document.getElementById('partyDate').value = new Date().toISOString().slice(0, 10);
            
            // Reset nút chọn quỹ
            document.getElementById('ptSelf').checked = true;
            window.togglePartyFund();

            window.tempPartyBills = [];
            window.renderPartyBillGallery();

            let chkHtml = `<div class="row g-2 m-0 px-2 pb-4 pt-2">`;
            Object.entries(window.state.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([tId, t]) => {
                chkHtml += `<div class="col-12 mt-2 mb-1"><span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-2 rounded-pill">${t.name}</span></div>`;
                Object.entries(window.state.members).forEach(([mId, m]) => {
                    if(m.teamId === tId) {
                        // KHÔNG CÓ THUỘC TÍNH `checked` Ở ĐÂY NỮA
                        chkHtml += `
                        <div class="col-6">
                            <input class="mem-select-cb party-checkbox" type="checkbox" value="${mId}" id="chk_${mId}" onchange="window.calculatePartySplit()">
                            <label class="mem-select-label" for="chk_${mId}"><i class="fas fa-glass-cheers me-2 opacity-25"></i>${m.name}</label>
                        </div>`;
                    }
                });
            });
            chkHtml += '</div>';
            document.getElementById('party-members-container').innerHTML = chkHtml;
            window.calculatePartySplit();
            new bootstrap.Modal(document.getElementById('modalParty')).show();
        };

        window.openEditParty = () => {
            const pId = window.state.bsPartyId;
            const p = window.state.monthData.parties?.[pId]; if(!p) return;
            window.closePartySheet();
            
            document.getElementById('editPartyId').value = pId;
            document.getElementById('partyName').value = p.name || '';
            document.getElementById('partyTotalBill').value = new Intl.NumberFormat('vi-VN').format(p.bill || 0);
            document.getElementById('partyFundAmount').value = new Intl.NumberFormat('vi-VN').format(p.fundAmount || 0);
            document.getElementById('partyDate').value = p.rawDate || new Date().toISOString().slice(0, 10);
            
            if ((p.fundAmount || 0) > 0) {
                document.getElementById('ptFund').checked = true;
            } else {
                document.getElementById('ptSelf').checked = true;
            }
            window.togglePartyFund();

            // Khôi phục mảng ảnh cũ (nếu có)
            if (p.billImages && Array.isArray(p.billImages)) {
                window.tempPartyBills = [...p.billImages];
            } else if (p.billImage) {
                window.tempPartyBills = [p.billImage]; // Hỗ trợ dữ liệu cũ 1 ảnh
            } else {
                window.tempPartyBills = [];
            }
            window.renderPartyBillGallery();

            let chkHtml = `<div class="row g-2 m-0 px-2 pb-4 pt-2">`;
            Object.entries(window.state.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([tId, t]) => {
                chkHtml += `<div class="col-12 mt-2 mb-1"><span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-2 rounded-pill">${t.name}</span></div>`;
                Object.entries(window.state.members).forEach(([mId, m]) => {
                    if(m.teamId === tId) {
                        const isChecked = p.members && p.members[mId] !== undefined;
                        chkHtml += `
                        <div class="col-6">
                            <input class="mem-select-cb party-checkbox" type="checkbox" value="${mId}" id="chk_${mId}" onchange="window.calculatePartySplit()" ${isChecked ? 'checked' : ''}>
                            <label class="mem-select-label" for="chk_${mId}"><i class="fas fa-glass-cheers me-2 opacity-25"></i>${m.name}</label>
                        </div>`;
                    }
                });
            });
            chkHtml += '</div>';
            document.getElementById('party-members-container').innerHTML = chkHtml;
            window.calculatePartySplit();
            new bootstrap.Modal(document.getElementById('modalParty')).show();
        };

        window.saveParty = () => {
            const editId = document.getElementById('editPartyId').value;
            const name = document.getElementById('partyName').value.trim(); 
            const bill = window.getRealNumber('partyTotalBill');
            const fundAmount = document.getElementById('ptFund').checked ? window.getRealNumber('partyFundAmount') : 0;
            const rawDate = document.getElementById('partyDate').value; 
            const perPerson = window.calculatePartySplit();

            if(!name) return alert("Vui lòng nhập tên bữa liên hoan!");
            if(bill <= 0) return alert("Vui lòng nhập tổng số tiền bill!");
            
            const oldMembers = (editId && window.state.monthData.parties?.[editId]?.members) || {};
            const members = {};
            document.querySelectorAll('.party-checkbox:checked').forEach(chk => {
                const mId = chk.value;
                members[mId] = oldMembers[mId] !== undefined ? oldMembers[mId] : 0;
            });
            
            if(Object.keys(members).length === 0) return alert("Hãy chọn ít nhất 1 người tham gia chia tiền!");

            const payload = { 
                name, bill, fundAmount, rawDate, 
                date: rawDate ? new Date(rawDate).toLocaleDateString('vi-VN') : '', 
                perPerson, members, 
                billImages: window.tempPartyBills // Lưu mảng nhiều ảnh
            };

            const ref = editId ? db.ref(`funds/${window.state.currentMonth}/parties/${editId}`).set(payload) : db.ref(`funds/${window.state.currentMonth}/parties`).push(payload);
            
            ref.then(() => {
                const modalEl = document.getElementById('modalParty');
                if (modalEl) modalEl.classList.remove('show'); modalEl.style.display = 'none';
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open'); document.body.style.overflow = ''; document.body.style.paddingRight = '';
            }).catch(err => alert("Lỗi khi lưu: " + err.message));
        };

        function renderLienHoan() {
            const container = document.getElementById('lienhoan-container'); if(!container) return;
            const parties = window.state.monthData.parties || {};
            const partyKeys = Object.keys(parties);
            let html = ''; let totalPartyDebt = 0;
            
            Object.entries(parties).forEach(([pId, p]) => {
                const memIds = Object.keys(p.members || {});
                let col = 0;
                memIds.forEach(mId => { col += (Number(p.members[mId]) || 0); });
                const debt = Math.max(0, (memIds.length * p.perPerson) - col);
                totalPartyDebt += debt;

                html += `
                <div class="party-card" onclick="window.openPartySheet('${pId}')">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="fw-bold text-dark fs-6 text-truncate pe-2">${p.name}</div>
                        <!-- LÀM NỔI BẬT SỐ TIỀN MỖI NGƯỜI Ở ĐÂY -->
                        <div class="party-per-person-badge flex-shrink-0">
                            <i class="fas fa-user-tag"></i> ${window.formatMoney(p.perPerson)}/ng
                        </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted"><i class="fas fa-calendar-day me-1"></i>${p.date} • ${memIds.length} tham gia (Tổng: ${window.formatShortMoney(p.bill)})</small>
                        ${debt > 0 ? `<span class="badge bg-warning text-dark shadow-sm">Cần thu: ${window.formatShortMoney(debt)}</span>` : `<span class="badge bg-success shadow-sm"><i class="fas fa-check"></i> Xong bill</span>`}
                    </div>
                </div>`;
            });
            
            container.innerHTML = partyKeys.length > 0 ? html : '<div class="card-clean border p-4 text-center text-muted small"><i class="fas fa-beer fa-2x mb-2 opacity-25"></i><br>Tháng này chưa có chầu nhậu nào!</div>';
            
            const headerEl = document.getElementById('lienhoan-thu-header');
            const subEl = document.getElementById('lienhoan-sub-header');
            if (headerEl) headerEl.innerText = `${partyKeys.length} chầu`;
            if (subEl) subEl.innerText = `Cần thu: ${window.formatShortMoney(totalPartyDebt)}`;
        }

        window.openPartySheet = (pId) => {
            window.state.bsPartyId = pId;
            const p = window.state.monthData.parties?.[pId]; if(!p) return;
            
            const fAmt = Number(p.fundAmount) || 0;
            const fundBadge = fAmt > 0 ? `<div class="badge bg-warning text-dark mt-1 shadow-sm"><i class="fas fa-wallet me-1"></i>Trích quỹ: ${window.formatMoney(fAmt)}</div>` : '';
            
            document.getElementById('bsPartyTitle').innerText = p.name;
            document.getElementById('bsPartyPerPerson').innerHTML = `Campuchia: ${window.formatMoney(p.perPerson)} / ng<br>${fundBadge}`;
            
            // Hiện nút Xem Hóa đơn nếu có ảnh
            const btnViewImg = document.getElementById('btnViewBillImg');
            if (btnViewImg) {
                const hasImages = (p.billImages && p.billImages.length > 0) || p.billImage;
                btnViewImg.style.display = hasImages ? 'block' : 'none';
                if(hasImages) {
                    const count = p.billImages ? p.billImages.length : 1;
                    btnViewImg.innerHTML = `<i class="fas fa-image me-1"></i>Hóa đơn (${count})`;
                }
            }
            // ---------------------------------------------
            
            let debtTotal = 0; let html = '<div class="card-clean border">';
            
            Object.entries(window.state.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([tId, t]) => {
                let teamHtml = '';
                Object.keys(p.members||{}).forEach(mId => {
                    const m = window.state.members[mId];
                    if(m && m.teamId === tId) {
                        const paidAmt = Number(p.members[mId]) || 0;
                        const isPaid = paidAmt >= p.perPerson;
                        if(!isPaid) debtTotal += (p.perPerson - paidAmt);


                        teamHtml += `
                        <div class="bg-white rounded-3 mb-2 shadow-sm border d-flex justify-content-between align-items-center p-2" style="border-left: 4px solid ${isPaid ? '#198754' : '#dc3545'} !important; transition: all 0.2s;">
                            <div class="d-flex align-items-center gap-2 ps-1" style="min-width: 0;">
                                <div class="fw-bold ${isPaid ? 'text-muted text-decoration-line-through' : 'text-dark'} text-truncate" style="font-size: 14.5px;">
                                    ${m.name}
                                </div>
                            </div>
                            <!-- Nút bấm Toggle trạng thái to rõ, chống bấm nhầm -->
                            <button class="btn btn-sm rounded-3 fw-bold d-flex align-items-center gap-1 shadow-sm flex-shrink-0" 
                                    onclick="togglePartyPaid('${pId}', '${mId}', ${p.perPerson}, ${isPaid})"
                                    style="background: ${isPaid ? '#e8f5e9' : '#fff5f5'}; color: ${isPaid ? '#198754' : '#dc3545'}; border: 1px solid ${isPaid ? '#badbcc' : '#ffc9c9'}; padding: 6px 12px; font-size: 12px;">
                                <i class="fas ${isPaid ? 'fa-check-circle' : 'fa-times-circle'}"></i> 
                                ${isPaid ? 'Đã đóng' : 'Chưa đóng'}
                            </button>
                        </div>`;
                    }
                });
                if(teamHtml) html += `<div class="bg-light px-3 py-1 fw-bold small text-muted border-bottom">${t.name}</div>` + teamHtml;
            });
            
            document.getElementById('bsPartyContent').innerHTML = html + '</div>';
            const badgeDebt = document.getElementById('bsPartyDebt');
            if(debtTotal > 0) { badgeDebt.className = 'badge bg-danger rounded-pill fs-6 shadow-sm'; badgeDebt.innerText = 'Cần thu: ' + window.formatShortMoney(debtTotal); }
            else { badgeDebt.className = 'badge bg-success rounded-pill fs-6 shadow-sm'; badgeDebt.innerHTML = '<i class="fas fa-check"></i> Đã thu đủ'; }
            
            document.getElementById('bsOverlay').classList.add('show');
            document.getElementById('bsParty').classList.add('show');
        };

        window.togglePartyPaid = (pId, mId, perPerson, isPaid) => { db.ref(`funds/${window.state.currentMonth}/parties/${pId}/members/${mId}`).set(isPaid ? 0 : perPerson); };
        window.closePartySheet = () => { window.state.bsPartyId = null; document.getElementById('bsOverlay').classList.remove('show'); document.getElementById('bsParty').classList.remove('show'); };
        window.deletePartyFromSheet = () => { if(confirm("Xóa toàn bộ bill nhậu này?")) { db.ref(`funds/${window.state.currentMonth}/parties/${window.state.bsPartyId}`).remove(); window.closePartySheet(); } };

        // ================= TAB 3: CHI QUỸ =================
        window.openAddExpenseModal = () => {
            document.getElementById('editExpId').value = ''; 
            document.getElementById('expModalTitle').innerHTML = '<i class="fas fa-minus-circle me-2"></i>Thêm Khoản Chi';
            document.getElementById('expDesc').value = ''; 
            document.getElementById('expAmount').value = '';
            document.getElementById('expDate').value = new Date().toISOString().slice(0, 10);
            new bootstrap.Modal(document.getElementById('modalExpense')).show();
        };

        window.openEditExpenseModal = (expId) => {
            const exp = window.state.monthData.expenses?.[expId]; if(!exp) return;
            document.getElementById('editExpId').value = expId; 
            document.getElementById('expModalTitle').innerHTML = '<i class="fas fa-edit me-2"></i>Sửa Khoản Chi';
            document.getElementById('expDesc').value = exp.desc || ''; 
            document.getElementById('expAmount').value = exp.amount || '';
            document.getElementById('expDate').value = exp.rawDate || new Date().toISOString().slice(0, 10);
            new bootstrap.Modal(document.getElementById('modalExpense')).show();
        };

        window.saveExpense = () => {
            const editId = document.getElementById('editExpId').value;
            const desc = document.getElementById('expDesc').value.trim(); 
            const amt = window.getRealNumber('expAmount');
            const rawDate = document.getElementById('expDate').value;
            
            if(!desc || !amt) return alert("Vui lòng nhập nội dung và số tiền chi!"); 
            const payload = { desc, amount: amt, type: 'chi', date: rawDate ? new Date(rawDate).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'), rawDate };
            
            if(editId) db.ref(`funds/${window.state.currentMonth}/expenses/${editId}`).update(payload).then(() => bootstrap.Modal.getInstance(document.getElementById('modalExpense')).hide());
            else db.ref(`funds/${window.state.currentMonth}/expenses`).push(payload).then(() => bootstrap.Modal.getInstance(document.getElementById('modalExpense')).hide());
        };

        window.deleteExpense = (expId) => {
            if(confirm('Xóa khoản chi này?')) {
                db.ref(`funds/${window.state.currentMonth}/expenses/${expId}`).remove();
            }
        };

        function renderChi() {
            const container = document.getElementById('chi-container'); 
            const allItems = window.state.monthData.expenses || {};
            const expEntries = Object.entries(allItems).filter(([_, item]) => item.type !== 'thu'); 
            
            // --- ĐỒNG BỘ: TỰ ĐỘNG THÊM KHOẢN TRÍCH QUỸ TỪ MỤC LIÊN HOAN VÀO LỊCH SỬ CHI ---
            Object.entries(window.state.monthData.parties || {}).forEach(([pId, p]) => {
                const fAmt = Number(p.fundAmount) || 0;
                if (fAmt > 0) {
                    expEntries.push([`party_${pId}`, {
                        desc: `🍻 Trích quỹ liên hoan: ${p.name}`,
                        amount: fAmt, type: 'chi', date: p.date, rawDate: p.rawDate || '',
                        isParty: true // Cờ đánh dấu để khóa nút sửa/xóa bên tab Chi
                    }]);
                }
            });

            let totalExp = 0; 
            expEntries.forEach(([_, exp]) => totalExp += (Number(exp.amount)||0));
            
            document.getElementById('chi-total-header').innerText = window.formatMoney(totalExp); 
            document.getElementById('chi-count-label').innerText = `${expEntries.length} khoản chi`; 
            
            if(expEntries.length === 0) {
                container.innerHTML = '<div class="card-clean border p-4 text-center text-muted small"><i class="fas fa-box-open fa-2x mb-2 opacity-25"></i><br>Chưa có khoản chi nào trong tháng.</div>';
                return;
            }
            
            let html = '<div class="timeline-container">';
            expEntries.sort((a,b) => new Date(b[1].rawDate || 0) - new Date(a[1].rawDate || 0)).forEach(([expId, exp]) => { 
                let iconClass = 'bg-secondary'; let iconItem = 'fa-receipt';
                const descLower = exp.desc.toLowerCase();
                
                if (exp.isParty) { iconItem = 'fa-glass-cheers'; iconClass = 'bg-warning text-dark'; }
                else if(descLower.includes('sân')) { iconItem = 'fa-futbol'; iconClass = 'bg-primary';}
                else if(descLower.includes('nước') || descLower.includes('đá')) { iconItem = 'fa-tint'; iconClass = 'bg-info';}
                else if(descLower.includes('áo') || descLower.includes('bóng')) { iconItem = 'fa-tshirt'; iconClass = 'bg-warning'; }
                else if(descLower.includes('y tế') || descLower.includes('băng')) { iconItem = 'fa-medkit'; iconClass = 'bg-danger'; }

                let actionsHtml = exp.isParty 
                    ? `<div class="small text-muted fst-italic mt-1" style="font-size: 10px;">(Khoản chi tự động từ tab Liên hoan)</div>`
                    : `<div class="timeline-actions"><div class="tl-btn edit" onclick="openEditExpenseModal('${expId}')"><i class="fas fa-pen"></i></div><div class="tl-btn delete" onclick="deleteExpense('${expId}')"><i class="fas fa-trash"></i></div></div>`;

                html += `
                <div class="timeline-item">
                    <div class="timeline-icon ${iconClass}"><i class="fas ${iconItem} ${exp.isParty ? 'text-dark' : 'text-white'}"></i></div>
                    <div class="timeline-content">
                        <div class="timeline-title">${exp.desc}</div>
                        <div class="timeline-date"><i class="far fa-calendar-times text-danger"></i> ${exp.date}</div>
                        ${actionsHtml}
                    </div>
                    <div class="timeline-amount" style="background:#f8d7da; color:#dc3545; border:1px solid #f5c2c7;">-${window.formatShortMoney(exp.amount)}</div>
                </div>`;
            });
            container.innerHTML = html + '</div>';
        }

        // ================= TAB 4: TỔNG KẾT =================
        function renderTongKet() {
            const defaultFund = window.state.globalSettings.defaultFund || 100000;
            let thuQuy = 0, thuCaDo = 0, thuKhac = 0, tongChi = 0; 
            
            const memberDebts = {};
            const memberContributions = {}; 
            
            Object.entries(window.state.members).forEach(([mId, m]) => {
                // Thêm phatDebt vào cấu trúc lưu trữ
                memberDebts[mId] = { name: m.name, teamName: window.state.teams[m.teamId]?.name || '', quyDebt: 0, cadoDebt: 0, cadoCount: 0, phatDebt: 0, partyDebt: 0 };
                memberContributions[mId] = { name: m.name, totalPaid: 0 };
            });

            let unpaidQuyCount = 0; let unpaidCadoPeopleCount = 0;
            
            // 1. Quét Thu Quỹ
            Object.entries(window.state.members).forEach(([mId, _]) => { 
                const rawPaid = window.state.monthData.regular?.[mId];
                if(rawPaid !== undefined && rawPaid !== null) { 
                    const paid = Number(rawPaid) || 0;
                    thuQuy += paid; 
                    if(memberContributions[mId]) memberContributions[mId].totalPaid += paid;
                } else if(memberDebts[mId]) { 
                    memberDebts[mId].quyDebt = defaultFund; 
                    unpaidQuyCount++; 
                }
            });
            
            // 2. Quét Cá độ
            let miniLogs = [];
            Object.entries(window.state.monthData.betting || {}).forEach(([_, match]) => {
                const matchTotal = Number(match.penalty_amount) || 0;
                let collectedInMatch = 0;

                Object.entries(match.losers || {}).forEach(([mId, amt]) => {
                    const paid = Number(amt) || 0; 
                    thuCaDo += paid;
                    collectedInMatch += paid;
                    if(memberContributions[mId]) memberContributions[mId].totalPaid += paid;

                    if (paid < matchTotal && memberDebts[mId]) { 
                        memberDebts[mId].cadoDebt += (matchTotal - paid); 
                        memberDebts[mId].cadoCount += 1; 
                    }
                });
                if (collectedInMatch > 0) {
                    miniLogs.push({ type: 'cado', desc: `Độ: ${match.name}`, amt: collectedInMatch, date: match.date || '' });
                }
            });
            
            // 3 & 4. Quét Thu Khác & Chi Tiêu (Phân loại chi tiết)
            let expenseStats = { san: 0, nuoc: 0, ao: 0, yte: 0, khac: 0 };
            let partyExpenses = []; // 🔥 Mảng mới lưu danh sách các bữa nhậu
            
            Object.values(window.state.monthData.expenses || {}).forEach(exp => {
                const amt = Number(exp.amount) || 0;
                if (exp.type === 'thu') {
                    thuKhac += amt;
                    miniLogs.push({ type: 'giaoluu', desc: exp.desc, amt: amt, date: exp.rawDate || exp.date });
                } else {
                    tongChi += amt;
                    const desc = exp.desc.toLowerCase();
                    if (desc.includes('sân')) expenseStats.san += amt;
                    else if (desc.includes('nước') || desc.includes('đá')) expenseStats.nuoc += amt;
                    else if (desc.includes('áo') || desc.includes('bóng')) expenseStats.ao += amt;
                    else if (desc.includes('y tế') || desc.includes('băng')) expenseStats.yte += amt;
                    else expenseStats.khac += amt;
                    
                    miniLogs.push({ type: 'chi', desc: exp.desc, amt: amt, date: exp.rawDate || exp.date });
                }
            });

             // Quét Liên hoan
           // Quét Liên hoan
            Object.values(window.state.monthData.parties || {}).forEach(p => {
                const fAmt = Number(p.fundAmount) || 0;
                if (fAmt > 0) {
                    tongChi += fAmt;
                    miniLogs.push({ type: 'chi', desc: `Trích LH: ${p.name}`, amt: fAmt, date: p.date });
                }
                
                // 🔥 TÍNH NỢ NHẬU:
                const perPerson = Number(p.perPerson) || 0;
                Object.entries(p.members || {}).forEach(([mId, paid]) => {
                    const paidAmt = Number(paid) || 0;
                    if (paidAmt < perPerson && memberDebts[mId]) {
                        memberDebts[mId].partyDebt += (perPerson - paidAmt);
                    }
                });
            });
            
            // Tạo HTML hiển thị Chi tiết chi
            let expTags = [];
            if(expenseStats.san > 0) expTags.push(`<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25" style="font-size:11px;">⚽ Sân: ${window.formatShortMoney(expenseStats.san)}</span>`);
            if(expenseStats.nuoc > 0) expTags.push(`<span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25" style="font-size:11px;">💧 Nước: ${window.formatShortMoney(expenseStats.nuoc)}</span>`);
            if(expenseStats.ao > 0) expTags.push(`<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25" style="font-size:11px;">👕 Áo: ${window.formatShortMoney(expenseStats.ao)}</span>`);
            if(expenseStats.yte > 0) expTags.push(`<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25" style="font-size:11px;">🚑 Y tế: ${window.formatShortMoney(expenseStats.yte)}</span>`);
            
            // 🔥 THAY ĐỔI: Duyệt mảng để in từng tên bữa nhậu
            partyExpenses.forEach(pe => {
                expTags.push(`<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25" style="font-size:11px;">🍻 ${pe.name}: ${window.formatShortMoney(pe.amount)}</span>`);
            });

            if(expenseStats.khac > 0) expTags.push(`<span class="badge bg-dark bg-opacity-10 text-dark border border-dark border-opacity-25" style="font-size:11px;">📦 Khác: ${window.formatShortMoney(expenseStats.khac)}</span>`);
            
            const expListEl = document.getElementById('tk-expense-list');
            if(expListEl) expListEl.innerHTML = expTags.join('') || '<span class="text-muted small fst-italic">Tháng này chưa có khoản chi nào.</span>';

            // 🔥 5. MỚI: Quét Tiền Phạt (Cộng vào Thu Khác và Nợ Phạt)
            Object.values(window.state.monthData.penalties || {}).forEach(p => {
                if (p.isPaid) {
                    thuKhac += (Number(p.amount) || 0); // Phạt đã đóng thì cộng vào tổng thu
                } else if (memberDebts[p.memberId]) {
                    memberDebts[p.memberId].phatDebt += (Number(p.amount) || 0); // Phạt chưa đóng thì cộng vào nợ
                }
            });
			
            const tonQuyThangTruoc = getCarryOverFund(window.state.currentMonth);
            const tongThu = thuQuy + thuCaDo + thuKhac;
            const tongHienTai = tonQuyThangTruoc + tongThu - tongChi;
            window.state.currentBalance = tongHienTai;
			
            const netGrowth = tongThu - tongChi; 
            const trendEl = document.getElementById('tk-mom-trend');
            if (trendEl) {
                if(netGrowth > 0) trendEl.innerHTML = `<span class="text-success bg-white px-2 py-1 rounded-pill shadow-sm" style="opacity: 0.95;"><i class="fas fa-caret-up"></i> +${window.formatShortMoney(netGrowth)} so với tháng trước</span>`;
                else if (netGrowth < 0) trendEl.innerHTML = `<span class="text-danger bg-white px-2 py-1 rounded-pill shadow-sm" style="opacity: 0.95;"><i class="fas fa-caret-down"></i> ${window.formatShortMoney(Math.abs(netGrowth))} (thâm hụt)</span>`;
                else trendEl.innerHTML = `<span class="text-muted bg-white px-2 py-1 rounded-pill shadow-sm" style="opacity: 0.95;"><i class="fas fa-minus"></i> Cân bằng thu chi</span>`;
            }

            const [y, m] = window.state.currentMonth.split('-');
            
            document.getElementById('tk-month-badge').innerText = `Tháng ${m}/${y}`;
            document.getElementById('tk-tonquythangtruoc').innerText = window.formatMoney(tonQuyThangTruoc);
            document.getElementById('tk-thuquy').innerText = window.formatMoney(thuQuy);
            document.getElementById('tk-thucado').innerText = window.formatMoney(thuCaDo);
            document.getElementById('tk-thukhac').innerText = window.formatMoney(thuKhac);
            document.getElementById('tk-tonquy').innerText = window.formatMoney(tongHienTai);
            
            document.getElementById('tk-tongthu-label').innerText = window.formatMoney(tongThu);
            document.getElementById('tk-tongchi-label').innerText = window.formatMoney(tongChi);

            const burnRateBar = document.getElementById('tk-burn-rate-bar');
            if (burnRateBar && tongThu > 0) {
                let burnPct = (tongChi / tongThu) * 100;
                if(burnPct > 100) burnPct = 100;
                burnRateBar.style.width = `${burnPct}%`;
                if (burnPct > 75) { burnRateBar.className = 'progress-bar bg-danger'; }
                else if (burnPct > 50) { burnRateBar.className = 'progress-bar bg-warning'; }
                else { burnRateBar.className = 'progress-bar bg-success'; }
            }

            const chart = document.getElementById('tk-chart');
            if (chart) {
                if (tongThu > 0) {
                    const pctQuy = Math.round((thuQuy / tongThu) * 100);
                    const pctDo = Math.round((thuCaDo / tongThu) * 100);
                    const pctKhac = 100 - pctQuy - pctDo; 
                    
                    document.getElementById('tk-pct-quy').innerText = `${pctQuy}%`;
                    document.getElementById('tk-pct-do').innerText = `${pctDo}%`;
                    document.getElementById('tk-pct-gl').innerText = `${pctKhac}%`;

                    chart.style.background = `conic-gradient(#198754 0% ${pctQuy}%, #0d6efd ${pctQuy}% ${pctQuy + pctDo}%, #0dcaf0 ${pctQuy + pctDo}% 100%)`;
                } else {
                    document.getElementById('tk-pct-quy').innerText = `0%`;
                    document.getElementById('tk-pct-do').innerText = `0%`;
                    document.getElementById('tk-pct-gl').innerText = `0%`;
                    chart.style.background = `conic-gradient(#e9ecef 0% 100%)`;
                }
            }

            const mvpList = Object.values(memberContributions).filter(c => c.totalPaid > 0).sort((a,b) => b.totalPaid - a.totalPaid).slice(0, 3);
            const mvpBoard = document.getElementById('tk-mvp-board');
            if (mvpList.length === 0) {
                mvpBoard.innerHTML = '<div class="text-muted small fst-italic p-3">Chưa có ai đóng quỹ tháng này.</div>';
            } else {
                let mvpHtml = '';
                const podiumOrder = [1, 0, 2];
                podiumOrder.forEach(idx => {
                    if (mvpList[idx]) {
                        const m = mvpList[idx]; const isTop1 = idx === 0;
                        const height = isTop1 ? '100px' : (idx === 1 ? '85px' : '75px');
                        const color = isTop1 ? '#ffc107' : (idx === 1 ? '#adb5bd' : '#cd7f32'); 
                        const medal = isTop1 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
                        
                        mvpHtml += `
                        <div class="d-flex flex-column align-items-center justify-content-end" style="width: 30%;">
                            <div class="fw-bold text-dark text-truncate w-100 text-center mb-1" style="font-size: 11px;">${m.name}</div>
                            <div class="badge bg-light text-dark border mb-2 shadow-sm">${window.formatShortMoney(m.totalPaid)}</div>
                            <div class="w-100 rounded-top-3 d-flex align-items-start justify-content-center pt-2 shadow-sm" style="height: ${height}; background: linear-gradient(180deg, ${color}33, transparent); border-top: 3px solid ${color};">
                                <span style="font-size: ${isTop1 ? '24px' : '18px'};">${medal}</span>
                            </div>
                        </div>`;
                    } else mvpHtml += `<div style="width: 30%;"></div>`; 
                });
                mvpBoard.innerHTML = mvpHtml;
            }
            
            // 🔥 CẬP NHẬT: Tính tổng nợ bao gồm cả Nợ Phạt và Nợ Nhậu
            let unpaidPhatCount = 0;
            let unpaidPartyCount = 0;

            const debtors = Object.entries(memberDebts).map(([mId, d]) => { 
                if(d.cadoDebt > 0) unpaidCadoPeopleCount++; 
                if(d.phatDebt > 0) unpaidPhatCount++;   // Đếm số người nợ phạt
                if(d.partyDebt > 0) unpaidPartyCount++; // Đếm số người nợ nhậu
                return { mId, ...d, totalDebt: d.quyDebt + d.cadoDebt + d.phatDebt + d.partyDebt }; 
            }).filter(d => d.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt);
            
            document.getElementById('tk-tongno-badge').innerText = window.formatMoney(debtors.reduce((sum, d) => sum + d.totalDebt, 0));
            // 🔥 HIỂN THỊ CHI TIẾT SỐ LƯỢNG NGƯỜI NỢ TỪNG KHOẢN
            document.getElementById('tk-debt-sub').innerText = `Quỹ: ${unpaidQuyCount} • Độ: ${unpaidCadoPeopleCount} • Phạt: ${unpaidPhatCount} • Nhậu: ${unpaidPartyCount}`;

            if(debtors.length === 0) {
                document.getElementById('tk-bangtongno').innerHTML = '<div class="text-success fw-bold p-4 text-center"><i class="fas fa-check-circle me-1"></i> Xong! Không còn ai nợ.</div>';
            } else {
                let htmlDebt = '';
                debtors.forEach(d => {
                    let tagsHtml = '';
                    if(d.quyDebt > 0) tagsHtml += `<span class="debt-tag debt-tag-quy">Quỹ ${window.formatShortMoney(d.quyDebt)}</span>`;
                    if(d.cadoDebt > 0) tagsHtml += `<span class="debt-tag debt-tag-cado">Độ ${window.formatShortMoney(d.cadoDebt)} (${d.cadoCount}t)</span>`;
                    // 🔥 BỔ SUNG TAG PHẠT
                    if(d.phatDebt > 0) tagsHtml += `<span class="debt-tag" style="background-color: #ffe5d0; color: #d95319; border: 1px solid #ffcba4;">Phạt ${window.formatShortMoney(d.phatDebt)}</span>`;
                    if(d.partyDebt > 0) tagsHtml += `<span class="debt-tag" style="background-color: #e2d9f3; color: #432874; border: 1px solid #d5c9e8;">Nhậu ${window.formatShortMoney(d.partyDebt)}</span>`;
                    htmlDebt += `
                    <div class="debt-item bg-white border-bottom">
                        <div class="text-truncate flex-grow-1 me-2">
                            <div class="fw-bold text-dark text-truncate" style="font-size:14px;">${d.name} <small class="text-muted fw-normal">(${d.teamName})</small></div>
                            <div class="debt-tags">${tagsHtml}</div>
                        </div>
                        <div class="d-flex align-items-center gap-2 flex-shrink-0">
                            <span class="fw-bold text-danger">${window.formatShortMoney(d.totalDebt)}</span>
                            <button class="btn btn-outline-success btn-sm rounded-pill fw-bold shadow-sm" style="font-size:11px; padding: 2px 12px;" onclick="settleAllMemberDebt('${d.mId}', '${d.name}', ${d.totalDebt})">Thu</button>
                        </div>
                    </div>`;
                });
                document.getElementById('tk-bangtongno').innerHTML = htmlDebt;
            }

            const miniFund = document.getElementById('miniDashFund');
            const miniDebt = document.getElementById('miniDashDebt');
            if (miniFund) miniFund.innerText = window.formatMoney(tongHienTai);
            
            if (miniDebt) {
                const totalDebtAmount = debtors.reduce((sum, d) => sum + d.totalDebt, 0);
                if (totalDebtAmount > 0) {
                    miniDebt.innerHTML = `<span class="text-danger">${window.formatShortMoney(totalDebtAmount)}</span> <span class="text-muted fw-normal" style="font-size:10px;">(${debtors.length} ng)</span>`;
                } else {
                    miniDebt.innerHTML = '<span class="text-success"><i class="fas fa-check"></i> Hoàn tất</span>';
                }
            }
		 }	
        window.settleAllMemberDebt = (mId, mName, totalDebt) => {
            if(!confirm(`Xác nhận đã thu ${window.formatMoney(totalDebt)} của ${mName}?`)) return;
            const defaultFund = window.state.globalSettings.defaultFund || 100000; const updates = {};
            
            // 1. Thu Quỹ
            const rawPaid = window.state.monthData.regular?.[mId];
            if(rawPaid === undefined || rawPaid === null) updates[`funds/${window.state.currentMonth}/regular/${mId}`] = Number(defaultFund);
            
            // 2. Thu Cá độ
            Object.entries(window.state.monthData.betting || {}).forEach(([matchId, match]) => {
                const matchTotal = Number(match.penalty_amount) || 0;
                if(match.losers && match.losers[mId] !== undefined && Number(match.losers[mId]) < matchTotal) {
                    updates[`funds/${window.state.currentMonth}/betting/${matchId}/losers/${mId}`] = matchTotal;
                }
            }); 

            // 🔥 3. Thu Phạt (Đánh dấu tất cả các lỗi chưa đóng của người này thành đã đóng)
            Object.entries(window.state.monthData.penalties || {}).forEach(([penId, p]) => {
                if(p.memberId === mId && !p.isPaid) {
                    updates[`funds/${window.state.currentMonth}/penalties/${penId}/isPaid`] = true;
                }
            });
			// 🔥 4. Thu Nhậu (Đánh dấu đã đóng đủ tiền cho tất cả các bữa nhậu)
            Object.entries(window.state.monthData.parties || {}).forEach(([pId, p]) => {
                if(p.members && p.members[mId] !== undefined && p.members[mId] < p.perPerson) {
                    updates[`funds/${window.state.currentMonth}/parties/${pId}/members/${mId}`] = p.perPerson;
                }
            });
            db.ref().update(updates);
        };

        // ================= THỐNG KÊ (RADAR, H2H & DOUGHNUT) =================
        window.currentStats = {};
        window.radarChartObj = null;
        window.financeChartObj = null; 

        function renderThongKe() {
            const container = document.getElementById('stat-container');
            const statTotalMatchesEl = document.getElementById('stat-total-matches');
            const betting = window.state.monthData.betting || {};
            
            const sortedMatches = Object.entries(betting).sort((a,b) => new Date(a[1].date||0) - new Date(b[1].date||0));
            const totalMatches = sortedMatches.length;
            
            // Cập nhật số trận đấu lên UI
            if (statTotalMatchesEl) statTotalMatchesEl.innerText = `${totalMatches} trận đấu`;

            const stats = {};
            Object.keys(window.state.members).forEach(mId => { 
                stats[mId] = { 
                    name: window.state.members[mId].name, 
                    win: 0, lose: 0, skip: 0, 
                    tongDongGop: (Number(window.state.monthData.regular?.[mId]) || 0),
                    form: [] 
                }; 
            });

            sortedMatches.forEach(([matchId, match]) => {
                Object.keys(stats).forEach(memId => {
                    if((match.winners||{})[memId]) { 
                        stats[memId].win++; 
                        stats[memId].form.push('W'); 
                    } else if((match.losers||{})[memId] !== undefined) {
                        stats[memId].lose++; 
                        stats[memId].form.push('L');
                        const penaltyPaid = Number(match.losers[memId]);
                        if (!isNaN(penaltyPaid)) stats[memId].tongDongGop += penaltyPaid;
                    } else { 
                        stats[memId].skip++; 
                        stats[memId].form.push('S'); 
                    }
                });
            });

            const activeStats = Object.values(stats).filter(s => (s.win + s.lose) > 0).sort((a, b) => b.win - a.win || a.lose - b.lose);
            
            // RENDER BẢNG PHONG ĐỘ (Có màng lọc chống lỗi nếu thiếu div HTML)
            if (container) {
                if(activeStats.length === 0) {
                    container.innerHTML = '<div class="text-center text-muted p-4">Chưa có ai tham gia thi đấu.</div>';
                } else {
                    let html = '';
                    activeStats.forEach((s, index) => {
                        const totalPlayed = s.win + s.lose; 
                        const winRate = Math.round((s.win / totalPlayed) * 100);
                        
                        let rankHtml = `<span class="text-muted fw-bold" style="width:20px;">#${index+1}</span>`;
                        if(index === 0) rankHtml = `<i class="fas fa-medal text-warning" style="font-size:18px; width:20px;"></i>`;
                        else if(index === 1) rankHtml = `<i class="fas fa-medal text-secondary" style="font-size:18px; width:20px;"></i>`;
                        else if(index === 2) rankHtml = `<i class="fas fa-medal" style="color: #cd7f32; font-size:18px; width:20px;"></i>`;

                        const recentForm = s.form.slice(-5);
                        let formHtml = '';
                        recentForm.forEach(f => {
                            let fClass = f === 'W' ? 'form-w' : (f === 'L' ? 'form-l' : 'form-s');
                            formHtml += `<span class="form-dot ${fClass}">${f}</span>`;
                        });

                        html += `
                        <div class="stat-item bg-white">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <div class="d-flex align-items-center gap-2">${rankHtml}<span class="fw-bold text-dark">${s.name}</span></div>
                                <div class="form-guide-box">${formHtml}</div>
                            </div>
                            <div class="d-flex align-items-center gap-2 mt-1">
                                <span class="small text-muted fw-bold" style="font-size:10px; width:25px;">${winRate}%</span>
                                <div class="stat-bar flex-grow-1"><div class="bg-success" style="width: ${winRate}%"></div><div class="bg-danger" style="width: ${100 - winRate}%"></div></div>
                            </div>
                        </div>`;
                    });
                    container.innerHTML = html;
                }
            }

            // --- VẼ BIỂU ĐỒ DOUGHNUT CỐNG HIẾN TÀI CHÍNH ---
            const ctxDoughnut = document.getElementById('financeDoughnutChart');
            if(ctxDoughnut) {
                let financeData = Object.values(stats).filter(s => s.tongDongGop > 0).sort((a,b) => b.tongDongGop - a.tongDongGop);
                let labels = []; let dataValues = [];
                let top5 = financeData.slice(0, 5);
                let rest = financeData.slice(5);
                
                top5.forEach(s => { labels.push(s.name); dataValues.push(s.tongDongGop); });
                if(rest.length > 0) {
                    labels.push('Còn lại');
                    dataValues.push(rest.reduce((sum, s) => sum + s.tongDongGop, 0));
                }

                if(window.financeChartObj) window.financeChartObj.destroy();
                
                if(financeData.length > 0) {
                    window.financeChartObj = new Chart(ctxDoughnut, {
                        type: 'doughnut',
                        data: {
                            labels: labels,
                            datasets: [{ 
                                data: dataValues, 
                                backgroundColor: ['#198754', '#0d6efd', '#ffc107', '#0dcaf0', '#6f42c1', '#adb5bd'], 
                                borderWidth: 2, borderColor: '#fff' 
                            }]
                        },
                        options: { maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }
                    });
                }
            }

            // --- TÍNH TOÁN OVR CHO RADAR VÀ H2H ---
            window.currentStats = stats;
            let maxPlayed = 1; let maxDongGop = 1;
            Object.values(window.currentStats).forEach(s => {
                s.played = s.win + s.lose;
                s.winRate = s.played > 0 ? (s.win / s.played) * 100 : 0;
                s.attendance = totalMatches > 0 ? (s.played / totalMatches) * 100 : 0;
                
                if(s.played > maxPlayed) maxPlayed = s.played;
                if(s.tongDongGop > maxDongGop) maxDongGop = s.tongDongGop;
            });

            Object.values(window.currentStats).forEach(s => {
                s.scoreWinRate = s.winRate; 
                s.scoreAttendance = s.attendance;
                s.scoreFinance = maxDongGop > 0 ? (s.tongDongGop / maxDongGop) * 100 : 0;
                s.scoreDedication = maxPlayed > 0 ? (s.played / maxPlayed) * 100 : 0;
                s.ovr = Math.round((s.scoreWinRate + s.scoreAttendance + s.scoreFinance + s.scoreDedication) / 4);
            });

            const radarSel = document.getElementById('radarPlayerSelect');
            const h2hA = document.getElementById('h2hPlayerA');
            const h2hB = document.getElementById('h2hPlayerB');
            
            let opts = '<option value="">Chọn cầu thủ...</option>';
            Object.entries(window.currentStats).sort((a,b) => a[1].name.localeCompare(b[1].name)).forEach(([mId, s]) => { opts += `<option value="${mId}">${s.name}</option>`; });
            
            if (radarSel) radarSel.innerHTML = opts;
            if (h2hA) h2hA.innerHTML = opts;
            if (h2hB) h2hB.innerHTML = opts;

            const memIds = Object.keys(window.currentStats);
            if(memIds.length >= 2) {
                if(radarSel && !radarSel.value) radarSel.value = memIds[0];
                if(h2hA && !h2hA.value) h2hA.value = memIds[0];
                if(h2hB && !h2hB.value) h2hB.value = memIds[1];
            }
            
            // Cập nhật biểu đồ Radar và H2H
            setTimeout(() => { 
                if(typeof window.updateRadarChart === 'function') window.updateRadarChart(); 
                if(typeof window.updateH2H === 'function') window.updateH2H(); 
            }, 100);
        }

        window.updateRadarChart = () => {
            const mId = document.getElementById('radarPlayerSelect')?.value;
            const ctx = document.getElementById('statRadarChart');
            if(!ctx) return;
            if(!mId || !window.currentStats[mId]) { if(window.radarChartObj) window.radarChartObj.destroy(); return; }

            const s = window.currentStats[mId];
            document.getElementById('radarOvr').innerText = s.ovr;
            document.getElementById('radarWin').innerText = s.win;
            document.getElementById('radarLose').innerText = s.lose;

            if(window.radarChartObj) window.radarChartObj.destroy();
            window.radarChartObj = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['Tỷ lệ Thắng', 'Chăm chỉ', 'Tài chính', 'Trận tham gia'],
                    datasets: [{ label: s.name, data: [s.scoreWinRate, s.scoreAttendance, s.scoreFinance, s.scoreDedication], backgroundColor: 'rgba(13, 110, 253, 0.2)', borderColor: 'rgba(13, 110, 253, 1)', pointBackgroundColor: 'rgba(13, 110, 253, 1)', borderWidth: 2 }]
                },
                options: { scales: { r: { angleLines: { display: true }, suggestedMin: 0, suggestedMax: 100, ticks: { display: false } } }, plugins: { legend: { display: false } }, maintainAspectRatio: false }
            });
        };

        window.updateH2H = () => {
            const idA = document.getElementById('h2hPlayerA')?.value;
            const idB = document.getElementById('h2hPlayerB')?.value;
            const cont = document.getElementById('h2hBarsContainer');
            if(!idA || !idB || !cont) return;
            const sA = window.currentStats[idA]; const sB = window.currentStats[idB];
            
            const metrics = [
                { label: 'Số trận tham gia', vA: sA.played, vB: sB.played, unit: ' trận' },
                { label: 'Tỷ lệ thắng', vA: Math.round(sA.winRate), vB: Math.round(sB.winRate), unit: '%' },
                { label: 'Tài chính', vA: sA.tongDongGop, vB: sB.tongDongGop, unit: 'đ', format: true }
            ];

            let html = '';
            metrics.forEach(m => {
                const sum = m.vA + m.vB;
                const pctA = sum === 0 ? 50 : (m.vA / sum) * 100;
                const pctB = sum === 0 ? 50 : (m.vB / sum) * 100;
                const dispA = m.format ? window.formatShortMoney(m.vA) : m.vA + m.unit;
                const dispB = m.format ? window.formatShortMoney(m.vB) : m.vB + m.unit;
                
                html += `
                <div class="mb-3">
                    <div class="d-flex justify-content-between small fw-bold mb-1 text-muted" style="font-size:10px;">
                        <span class="text-primary">${dispA}</span><span class="text-uppercase">${m.label}</span><span class="text-success">${dispB}</span>
                    </div>
                    <div class="h2h-bar-bg shadow-sm">
                        <div class="h2h-bar-a" style="width: ${pctA}%"></div><div class="h2h-bar-b" style="width: ${pctB}%"></div>
                    </div>
                </div>`;
            }); cont.innerHTML = html;
        };

        // ================= CÀI ĐẶT =================
        window.openFundSettings = () => {
            document.getElementById('inputDefaultFund').value = window.state.globalSettings.defaultFund || 100000;
            new bootstrap.Modal(document.getElementById('modalFundSettings')).show();
        };

        window.saveFundSettings = () => {
            const amt = window.getRealNumber('inputDefaultFund');
            if(amt > 0) {
                db.ref('settings').update({ defaultFund: amt })
                .then(() => bootstrap.Modal.getInstance(document.getElementById('modalFundSettings')).hide());
            }
        };

        window.updateTeamSelects = () => {
            const select = document.getElementById('memTeam');
            if(select) select.innerHTML = Object.entries(window.state.teams).sort((a,b) => (a[1].order||0) - (b[1].order||0)).map(([id, t]) => `<option value="${id}">${t.name}</option>`).join('');
            
            // Đổ danh sách cầu thủ vào bảng Tài trợ và bảng Phạt
            let memOpts = '<option value="">Tập thể / Ẩn danh</option>';
            let memOptsP = '<option value="">-- Chọn cầu thủ vi phạm --</option>'; // Thêm dòng nhắc nhở
            
            Object.entries(window.state.members).sort((a,b) => a[1].name.localeCompare(b[1].name)).forEach(([mId, m]) => { 
                memOpts += `<option value="${mId}">${m.name}</option>`; 
                memOptsP += `<option value="${mId}">${m.name}</option>`; 
            });
            
            const incSel = document.getElementById('incMemberId'); 
            if(incSel) incSel.innerHTML = memOpts;
            
            const penSel = document.getElementById('penMemberId'); 
            if(penSel) penSel.innerHTML = memOptsP; // Cập nhật danh sách vào đây
        };

        window.openAddTeamForm = () => {
            document.getElementById('editTeamId').value = '';
            document.getElementById('newTeamName').value = '';
            document.getElementById('teamModalTitle').innerHTML = '<i class="fas fa-layer-group me-2"></i>Thêm phân đội';
            new bootstrap.Modal(document.getElementById('modalAddTeam')).show();
        };

        window.openEditTeam = (e, tId) => {
            e.stopPropagation(); 
            const t = window.state.teams[tId];
            if(!t) return;
            document.getElementById('editTeamId').value = tId;
            document.getElementById('newTeamName').value = t.name;
            document.getElementById('teamModalTitle').innerHTML = '<i class="fas fa-edit me-2"></i>Sửa tên đội';
            new bootstrap.Modal(document.getElementById('modalAddTeam')).show();
        };

        window.addTeam = () => {
            const name = document.getElementById('newTeamName').value.trim();
            const editId = document.getElementById('editTeamId').value;
            if(!name) return alert("Vui lòng nhập tên đội!");
            
            if(editId) {
                db.ref(`teams/${editId}`).update({ name })
                    .then(() => bootstrap.Modal.getInstance(document.getElementById('modalAddTeam')).hide());
            } else {
                const order = Object.keys(window.state.teams).length + 1;
                db.ref('teams').push({ name, order })
                    .then(() => bootstrap.Modal.getInstance(document.getElementById('modalAddTeam')).hide());
            }
        };

        window.deleteTeam = (e, tId) => {
            e.stopPropagation();
            const hasMembers = Object.values(window.state.members).some(m => m.teamId === tId);
            if(hasMembers) return alert("Phân đội này đang có thành viên. Vui lòng chuyển hoặc xóa thành viên trước!");
            if(confirm("Bạn có chắc muốn xóa phân đội này vĩnh viễn?")) {
                db.ref(`teams/${tId}`).remove();
            }
        };

        window.openMemberManager = () => {
            window.renderMemberManager();
            const modalElement = document.getElementById('modalMemberManager');
            if (modalElement) {
                new bootstrap.Modal(modalElement).show();
            } else {
                alert("Lỗi: Không tìm thấy giao diện Quản lý Thành viên!");
            }
        };

        window.toggleMemberActions = (mId) => {
            const el = document.getElementById(`mem_item_${mId}`);
            if(el) el.classList.toggle('expanded');
        };

        window.toggleTeamGroup = (tId) => {
            const el = document.getElementById(`team_list_${tId}`);
            if(el) el.classList.toggle('show');
            const icon = document.getElementById(`team_icon_${tId}`);
            if(icon) {
                if(el.classList.contains('show')) { icon.classList.remove('fa-chevron-right'); icon.classList.add('fa-chevron-down'); }
                else { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-right'); }
            }
        };

        window.deleteMember = (e, mId, mName) => {
            e.stopPropagation();
            if(confirm(`Xóa cầu thủ "${mName}" khỏi danh sách?`)) {
                db.ref(`members/${mId}`).remove();
            }
        };

        // Hàm nén và xử lý ảnh Avatar ngay trên trình duyệt
        window.handleAvatarUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 150; // Nén ảnh nhỏ lại (tối đa 150px) để không làm nặng DB
                    let width = img.width; let height = img.height;
                    
                    if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                    else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                    
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Xuất ra Base64 định dạng JPEG chất lượng 70% (siêu nhẹ)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    
                    document.getElementById('tempAvatarBase64').value = dataUrl;
                    document.getElementById('avatarPreview').src = dataUrl;
                    document.getElementById('avatarPreview').classList.remove('d-none');
                    document.getElementById('avatarUploadZone').classList.add('has-img');
                    document.getElementById('btnRemoveAvatar').style.display = 'flex';
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        };

        window.removeAvatarSelection = (e) => {
            if(e) e.stopPropagation();
            document.getElementById('memAvatarInput').value = '';
            document.getElementById('tempAvatarBase64').value = '';
            document.getElementById('avatarPreview').src = '';
            document.getElementById('avatarPreview').classList.add('d-none');
            document.getElementById('avatarUploadZone').classList.remove('has-img');
            document.getElementById('btnRemoveAvatar').style.display = 'none';
        };

        // Giao diện danh bạ kiểu mới
        window.renderMemberManager = () => {
            let html = '';
            const accMembers = document.getElementById('accMembers');
            if(!accMembers) return;

            Object.entries(window.state.teams).sort((a,b) => (a[1].order||0) - (b[1].order||0)).forEach(([tId, t], index) => {
                let memHtml = ''; let count = 0;
                
                Object.entries(window.state.members).forEach(([mId, m]) => {
                    if(m.teamId === tId) {
                        count++;
                        const dobStr = m.dob ? new Date(m.dob).toLocaleDateString('vi-VN') : '---';
                        const phoneStr = m.phone || 'Chưa có SĐT';
                        
                        // Xử lý hiển thị Avatar cá nhân hoặc Chữ cái đầu
                        let avatarContent = m.avatar ? `<img src="${m.avatar}">` : window.getInitials(m.name);
                        
                        memHtml += `
                        <div class="mem-item" id="mem_item_${mId}" onclick="toggleMemberActions('${mId}')">
                            <div class="mem-info-row">
                                <div class="mem-avatar-wrap">${avatarContent}</div>
                                <div class="flex-grow-1">
                                    <div class="mem-name-text">${m.name}</div>
                                    <div class="mem-meta">
                                        <span><i class="fas fa-phone-alt text-success opacity-75"></i> ${phoneStr}</span>
                                        <span><i class="fas fa-birthday-cake text-warning opacity-75"></i> ${dobStr}</span>
                                    </div>
                                </div>
                                <i class="fas fa-chevron-down chevron-icon"></i>
                            </div>
                            <div class="mem-actions">
                                <button class="btn-action-sm edit" onclick="openMemberForm(event, '${mId}')"><i class="fas fa-pen text-primary"></i> Sửa</button>
                                <button class="btn-action-sm delete" onclick="deleteMember(event, '${mId}', '${m.name}')"><i class="fas fa-trash text-danger"></i> Xóa</button>
                            </div>
                        </div>`;
                    }
                });
                
                const isShow = index === 0 ? 'show' : '';
                const iconClass = index === 0 ? 'fa-chevron-down' : 'fa-chevron-right';

                html += `
                <div class="team-group">
                    <div class="team-header shadow-sm" onclick="toggleTeamGroup('${tId}')">
                        <div class="team-header-title">
                            <i class="fas fa-shield-alt text-warning"></i> ${t.name} <span class="badge bg-white text-success rounded-pill ms-2" style="font-size:10px;">${count}</span>
                        </div>
                        <div class="d-flex align-items-center gap-3">
                            <i class="fas fa-pen text-white opacity-75" style="font-size:14px; padding:4px;" onclick="openEditTeam(event, '${tId}')"></i>
                            <i class="fas fa-trash text-white opacity-75" style="font-size:14px; padding:4px;" onclick="deleteTeam(event, '${tId}')"></i>
                            <i class="fas ${iconClass} text-white ms-2" id="team_icon_${tId}"></i>
                        </div>
                    </div>
                    <div class="mem-list ${isShow}" id="team_list_${tId}">
                        ${memHtml || '<div class="p-4 text-center text-muted small fst-italic">Chưa có thành viên nào.</div>'}
                    </div>
                </div>`;
            });
            accMembers.innerHTML = html;
        };

        window.openMemberForm = (e, mId = '') => {
            if(e) e.stopPropagation();
            document.getElementById('editMemId').value = mId;
            window.removeAvatarSelection(); // Xóa ảnh tạm trước khi mở
            
            if(mId && window.state.members[mId]) {
                const m = window.state.members[mId];
                document.getElementById('memFormTitle').innerText = 'Sửa Thông Tin';
                document.getElementById('memName').value = m.name || '';
                document.getElementById('memTeam').value = m.teamId || '';
                document.getElementById('memDOB').value = m.dob || '';
                document.getElementById('memPhone').value = m.phone || '';
                
                if (m.avatar) {
                    document.getElementById('tempAvatarBase64').value = m.avatar;
                    document.getElementById('avatarPreview').src = m.avatar;
                    document.getElementById('avatarPreview').classList.remove('d-none');
                    document.getElementById('avatarUploadZone').classList.add('has-img');
                    document.getElementById('btnRemoveAvatar').style.display = 'flex';
                }
            } else {
                document.getElementById('memFormTitle').innerText = 'Thêm Cầu Thủ Mới';
                document.getElementById('memName').value = '';
                document.getElementById('memDOB').value = '';
                document.getElementById('memPhone').value = '';
                const select = document.getElementById('memTeam');
                if(select.options.length > 0) select.selectedIndex = 0;
            }
            new bootstrap.Modal(document.getElementById('modalMemberForm')).show();
        };

        window.saveMember = () => {
            const id = document.getElementById('editMemId').value;
            const name = document.getElementById('memName').value.trim();
            const teamId = document.getElementById('memTeam').value;
            const dob = document.getElementById('memDOB').value;
            const phone = document.getElementById('memPhone').value;
            const avatar = document.getElementById('tempAvatarBase64').value; // Lấy ảnh
            
            if(!name || !teamId) return alert('Vui lòng nhập tên và chọn phân đội!');
            
            // Nếu không có ảnh thì để null, không lưu chuỗi rỗng làm nặng DB
            const payload = { name, teamId, dob, phone, avatar: avatar || null };
            
            if(id) {
                db.ref(`members/${id}`).update(payload).then(() => bootstrap.Modal.getInstance(document.getElementById('modalMemberForm')).hide());
            } else {
                db.ref('members').push(payload).then(() => bootstrap.Modal.getInstance(document.getElementById('modalMemberForm')).hide());
            }
        };

        // ================= XUẤT BÁO CÁO =================
        window.exportReportImage = () => {
            const btn = document.getElementById('btnExportImage');
            const oldHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Đang vẽ Báo cáo...';

            const defaultFund = window.state.globalSettings.defaultFund || 100000;
            let thuQuy = 0, thuCaDo = 0, thuKhac = 0, tongChi = 0;
            
            const reportData = {};
            Object.entries(window.state.members).forEach(([mId, m]) => {
                reportData[mId] = {
                    name: m.name,
                    quyPaid: 0, cadoPaid: 0,
                    quyDebt: 0, cadoDebt: 0, phatDebt: 0, // Thêm phatDebt
                    owedMatches: [] 
                };
            });

            Object.entries(window.state.members).forEach(([mId, m]) => {
                const rawPaid = window.state.monthData.regular?.[mId];
                if (rawPaid !== undefined && rawPaid !== null) { 
                    const paid = Number(rawPaid) || 0;
                    reportData[mId].quyPaid = paid; 
                    thuQuy += paid; 
                } else if (reportData[mId]) { 
                    reportData[mId].quyDebt = defaultFund; 
                }
            });

            Object.entries(window.state.monthData.betting || {}).forEach(([matchId, match]) => {
                const matchTotal = Number(match.penalty_amount) || 0;
                
                Object.entries(match.losers || {}).forEach(([mId, amt]) => {
                    const paid = Number(amt) || 0;
                    if (reportData[mId]) {
                        reportData[mId].cadoPaid += paid;
                        thuCaDo += paid;
                        
                        if (paid < matchTotal) {
                            reportData[mId].cadoDebt += (matchTotal - paid);
                            reportData[mId].owedMatches.push(match.name);
                        }
                    }
                });
            });
			// 🔥 THÊM VÀO ĐÂY: Quét nợ Phạt cho ảnh báo cáo
            Object.values(window.state.monthData.penalties || {}).forEach(p => {
                if (!p.isPaid && reportData[p.memberId]) {
                    reportData[p.memberId].phatDebt += (Number(p.amount) || 0);
                }
            });
            let expenseStats = { san: 0, nuoc: 0, ao: 0, yte: 0, khac: 0 };
            let partyExpenses = []; // 🔥 Mảng mới

            Object.values(window.state.monthData.expenses || {}).forEach(exp => {
                const amt = Number(exp.amount) || 0;
                if (exp.type === 'thu') {
                    thuKhac += amt;
                } else {
                    tongChi += amt;
                    const desc = exp.desc.toLowerCase();
                    if (desc.includes('sân')) expenseStats.san += amt;
                    else if (desc.includes('nước') || desc.includes('đá')) expenseStats.nuoc += amt;
                    else if (desc.includes('áo') || desc.includes('bóng')) expenseStats.ao += amt;
                    else if (desc.includes('y tế') || desc.includes('băng')) expenseStats.yte += amt;
                    else expenseStats.khac += amt;
                }
            });

            Object.values(window.state.monthData.parties || {}).forEach(p => {
                const fAmt = Number(p.fundAmount) || 0;
                if (fAmt > 0) {
                    tongChi += fAmt;
                    partyExpenses.push({ name: p.name, amount: fAmt }); // 🔥 Lưu vào mảng
                }
            });

            const tonQuyThangTruoc = getCarryOverFund(window.state.currentMonth);
            const tongHienTai = tonQuyThangTruoc + thuQuy + thuCaDo + thuKhac - tongChi;

            const paidList = [];
            const debtList = [];

            Object.values(reportData).forEach(d => {
                const totalPaid = d.quyPaid + d.cadoPaid;
                const totalDebt = d.quyDebt + d.cadoDebt + d.phatDebt;
                
                if (totalPaid > 0) paidList.push({ ...d, totalPaid });
                if (totalDebt > 0) debtList.push({ ...d, totalDebt });
            });

            paidList.sort((a,b) => b.totalPaid - a.totalPaid);
            debtList.sort((a,b) => b.totalDebt - a.totalDebt);

            const [y, m] = window.state.currentMonth.split('-');
            document.getElementById('exp-month').innerText = `TỔNG KẾT THÁNG ${m}/${y}`;
            document.getElementById('exp-old').innerText = window.formatMoney(tonQuyThangTruoc);
            document.getElementById('exp-thuquy').innerText = window.formatMoney(thuQuy);
            document.getElementById('exp-thucado').innerText = window.formatMoney(thuCaDo);
            document.getElementById('exp-thukhac').innerText = window.formatMoney(thuKhac);
            document.getElementById('exp-chi').innerText = window.formatMoney(tongChi);
			// 🔥 THÊM MỚI: Render chi tiết chi vào ảnh
            let expTagsHtml = [];
            if(expenseStats.san > 0) expTagsHtml.push(`<span style="background:#cfe2ff; color:#084298; border:1px solid #b6d4fe; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:bold;">⚽ Sân: ${window.formatShortMoney(expenseStats.san)}</span>`);
            if(expenseStats.nuoc > 0) expTagsHtml.push(`<span style="background:#cff4fc; color:#055160; border:1px solid #b6effb; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:bold;">💧 Nước: ${window.formatShortMoney(expenseStats.nuoc)}</span>`);
            if(expenseStats.ao > 0) expTagsHtml.push(`<span style="background:#fff3cd; color:#664d03; border:1px solid #ffecb5; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:bold;">👕 Áo: ${window.formatShortMoney(expenseStats.ao)}</span>`);
            if(expenseStats.yte > 0) expTagsHtml.push(`<span style="background:#f8d7da; color:#842029; border:1px solid #f5c2c7; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:bold;">🚑 Y tế: ${window.formatShortMoney(expenseStats.yte)}</span>`);
            
            // 🔥 THAY ĐỔI: Duyệt mảng để in từng tên bữa nhậu
            partyExpenses.forEach(pe => {
                expTagsHtml.push(`<span style="background:#e2d9f3; color:#432874; border:1px solid #d5c9e8; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:bold;">🍻 ${pe.name}: ${window.formatShortMoney(pe.amount)}</span>`);
            });

            if(expenseStats.khac > 0) expTagsHtml.push(`<span style="background:#e2e3e5; color:#41464b; border:1px solid #d3d6d8; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:bold;">📦 Khác: ${window.formatShortMoney(expenseStats.khac)}</span>`);
            
            const expDetailsEl = document.getElementById('exp-chi-details-list');
            if(expDetailsEl) expDetailsEl.innerHTML = expTagsHtml.length > 0 ? expTagsHtml.join('') : '<span style="color:#adb5bd; font-style:italic;">Không có chi tiết</span>';
            document.getElementById('exp-now').innerText = window.formatMoney(tongHienTai);

            let paidHtml = '';
            if (paidList.length === 0) {
                paidHtml = '<div style="color:#adb5bd; font-style:italic; text-align:center;">Chưa có thành viên nào nộp.</div>';
            } else {
                paidList.forEach(p => {
                    let details = [];
                    if (p.quyPaid > 0) details.push(`Quỹ ${window.formatShortMoney(p.quyPaid)}`);
                    if (p.cadoPaid > 0) details.push(`Độ ${window.formatShortMoney(p.cadoPaid)}`);
                    
                    paidHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f8f9fa; padding:8px 12px; border-radius:8px; margin-bottom:6px;">
                        <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                            <span style="font-weight:800; color:#212529; font-size:14px;">${p.name}</span>
                            <span style="font-size:12px; color:#6c757d; font-weight:600;">(${details.join(' • ')})</span>
                        </div>
                        <div style="font-weight:900; color:#198754; font-size:15px; margin-left:10px;">+${window.formatShortMoney(p.totalPaid)}</div>
                    </div>`;
                });
            }
            document.getElementById('exp-paid-list').innerHTML = paidHtml;

            let debtHtml = '';
            if (debtList.length === 0) {
                debtHtml = '<div style="color:#198754; font-weight:bold; text-align:center; padding: 20px; font-size:16px;">Tuyệt vời! Tất cả đã hoàn thành. 🎉</div>';
            } else {
                debtList.forEach(d => {
                    let tags = '';
                    if(d.quyDebt > 0) tags += `<span style="background:#fff5f5; color:#dc3545; border:1px solid #ffc9c9; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;">Quỹ ${window.formatShortMoney(d.quyDebt)}</span>`;
                    if(d.cadoDebt > 0) tags += `<span style="background:#fff9db; color:#b45309; border:1px solid #fde68a; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;">Độ ${window.formatShortMoney(d.cadoDebt)}</span>`;
                    // 👇 DÒNG MỚI THÊM VÀO ĐÂY (Màu cam đất giống tag Nợ Phạt bên ngoài)
                    if(d.phatDebt > 0) tags += `<span style="background:#ffe5d0; color:#d95319; border:1px solid #ffcba4; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:4px;">Phạt ${window.formatShortMoney(d.phatDebt)}</span>`;
                    let matchDetails = '';
                    if (d.owedMatches.length > 0) {
                        matchDetails = `<div style="font-size:11.5px; color:#b45309; margin-top:4px; font-style:italic; font-weight:500;">⚠️ Trận: ${d.owedMatches.join(', ')}</div>`;
                    }
                    
                    debtHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f8f9fa; padding:8px 12px; border-radius:8px; margin-bottom:6px;">
                        <div style="flex:1; padding-right:10px;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <div style="font-weight:800; color:#212529; font-size:14px;">${d.name}</div>
                                <div style="display:flex; gap:4px;">${tags}</div>
                            </div>
                            ${matchDetails}
                        </div>
                        <div style="font-weight:900; color:#dc3545; font-size:15px;">${window.formatShortMoney(d.totalDebt)}</div>
                    </div>`;
                });
            }
            document.getElementById('exp-debt-list').innerHTML = debtHtml;
            
            const now = new Date();
            document.getElementById('exp-footer-time').innerText = `🕒 Trích xuất lúc ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} ngày ${now.toLocaleDateString('vi-VN')} - Vui lòng hoàn thành quỹ cho Thủ quỹ nhé! ⚽❤️`;

            setTimeout(() => {
                const exportZone = document.getElementById('report-export-zone');
                html2canvas(exportZone, { 
                    scale: 6,
                    useCORS: true, 
                    backgroundColor: '#f4f7f6' 
                }).then(canvas => {
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            alert('Lỗi: Bộ nhớ máy không đủ.');
                            btn.innerHTML = oldHtml;
                            return;
                        }
                        
                        const fileName = `Bao_Cao_FC_Thang_${m}_${y}.png`;
                        const file = new File([blob], fileName, { type: 'image/png' });

                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            navigator.share({
                                files: [file],
                                title: 'Báo Cáo FC Thập Cẩm',
                                text: 'Gửi anh em bảng tổng kết quỹ tháng này nhé!'
                            }).then(() => {
                                btn.innerHTML = oldHtml;
                            }).catch((error) => {
                                console.log('Người dùng hủy chia sẻ', error);
                                btn.innerHTML = oldHtml;
                            });
                        } else {
                            const objUrl = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.download = fileName;
                            link.href = objUrl;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(objUrl);
                            
                            btn.innerHTML = oldHtml;
                        }
                    }, 'image/png');
                }).catch(err => {
                    alert('Lỗi khi vẽ ảnh.');
                    console.error(err);
                    btn.innerHTML = oldHtml;
                });
            }, 300);
        };
		// ================= HỒ SƠ QUẢN LÝ (ADMIN PROFILE) =================
        window.renderAdminProfile = () => {
            const profile = window.state.adminProfile;
            const nameStr = profile.name || 'Quản lý';
            
            // Lấy từ cuối cùng của tên (Ví dụ: "Phạm Quang Trung" -> "Trung" -> Lấy chữ "T")
            const avatarContent = profile.avatar ? `<img src="${profile.avatar}">` : window.getInitials(nameStr);
            
            const wrap1 = document.getElementById('adminAvatarWrap1');
            if (wrap1) wrap1.innerHTML = avatarContent;
            
            const txt1 = document.getElementById('adminNameTxt1');
            if (txt1) txt1.innerText = nameStr;
        };
        window.openAdminProfile = () => {
            const profile = window.state.adminProfile;
            document.getElementById('adminNameInput').value = profile.name || '';
            
            window.removeAdminAvatarSelection(); // Xóa ảnh tạm trước khi mở
            if (profile.avatar) {
                document.getElementById('tempAdminAvatarBase64').value = profile.avatar;
                document.getElementById('adminAvatarPreview').src = profile.avatar;
                document.getElementById('adminAvatarPreview').classList.remove('d-none');
                document.getElementById('adminAvatarUploadZone').classList.add('has-img');
                document.getElementById('btnRemoveAdminAvatar').style.display = 'flex';
            }
            new bootstrap.Modal(document.getElementById('modalAdminProfile')).show();
        };

        // Hàm nén ảnh cho Admin (Tương tự ảnh thành viên)
        window.handleAdminAvatarUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 150;
                    let width = img.width; let height = img.height;
                    if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                    else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    
                    document.getElementById('tempAdminAvatarBase64').value = dataUrl;
                    document.getElementById('adminAvatarPreview').src = dataUrl;
                    document.getElementById('adminAvatarPreview').classList.remove('d-none');
                    document.getElementById('adminAvatarUploadZone').classList.add('has-img');
                    document.getElementById('btnRemoveAdminAvatar').style.display = 'flex';
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        };

        window.removeAdminAvatarSelection = (e) => {
            if(e) e.stopPropagation();
            document.getElementById('adminAvatarInput').value = '';
            document.getElementById('tempAdminAvatarBase64').value = '';
            document.getElementById('adminAvatarPreview').src = '';
            document.getElementById('adminAvatarPreview').classList.add('d-none');
            document.getElementById('adminAvatarUploadZone').classList.remove('has-img');
            document.getElementById('btnRemoveAdminAvatar').style.display = 'none';
        };

        window.saveAdminProfile = () => {
            const name = document.getElementById('adminNameInput').value.trim();
            const avatar = document.getElementById('tempAdminAvatarBase64').value;
            if(!name) return alert('Vui lòng nhập tên hiển thị!');
            
            // Lưu vào Firebase
            db.ref('settings/adminProfile').set({ name, avatar: avatar || null })
                .then(() => bootstrap.Modal.getInstance(document.getElementById('modalAdminProfile')).hide());
        };
        // ================= HEADER & CHUYỂN TAB =================
		window.switchTab = (tabId, element) => {
            window.state.activeTab = tabId;
            
            // 🔥 TỰ ĐỘNG ĐỔI MÀU THEO TAB
            const tabColors = {
                'thu': '#198754',       // Thu Quỹ: Xanh lá (Tiền tệ)
                'cado': '#0d6efd',      // Giao lưu/Cá độ: Xanh dương (Thể thao)
                'chi': '#dc3545',       // Chi Quỹ: Đỏ (Cảnh báo chi tiêu)
                'tongket': '#6f42c1',   // Tổng kết: Tím (Phân tích/Báo cáo)
                'thongke': '#0dcaf0'    // Thống kê: Xanh lơ (Biểu đồ)
            };
            const activeColor = tabColors[tabId] || '#198754';
            
            // Gán biến màu vào CSS
            document.documentElement.style.setProperty('--theme-color', activeColor);
            document.documentElement.style.setProperty('--theme-color-alpha', hexToRgba(activeColor, 0.15));
            const headerFull = document.getElementById('headerFull');
            const headerCompact = document.getElementById('headerCompact');
            const titleElement = document.getElementById('headerTabTitle');

            if(tabId === 'thu') { 
                headerFull.style.display = 'flex'; 
                headerCompact.style.display = 'none'; 
            } else {
                headerFull.style.display = 'none'; 
                headerCompact.style.display = 'flex';
                if(tabId === 'cado') titleElement.innerText = 'GIAO LƯU';
                else if(tabId === 'chi') titleElement.innerText = 'CHI QUỸ';
                else if(tabId === 'tongket') titleElement.innerText = 'TỔNG KẾT';
                else if(tabId === 'thongke') {
                    titleElement.innerText = 'THỐNG KÊ';
                    setTimeout(() => { updateRadarChart(); updateH2H(); }, 50);
                }
            }

            document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');
            
            if(element) { 
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                element.classList.add('active');
            }

            // --- VIÊN THUỐC TRƯỢT DOCK ---
            const tabs = ['thu', 'cado', 'chi', 'tongket', 'thongke'];
            const idx = tabs.indexOf(tabId);
            const indicator = document.getElementById('dockIndicator');
            if(indicator && idx !== -1) { 
                indicator.style.transform = `translateX(${idx * 100}%)`; 
            }

            // Luôn hiện lại thanh Dock và cuộn lên đầu khi vừa chuyển sang tab mới
            const nav = document.getElementById('mainBottomNav');
            if(nav) nav.classList.remove('dock-hidden');
            window.scrollTo({ top: 0, behavior: 'instant' });

            const fab = document.getElementById('globalFabBtn');
            if(tabId === 'cado') {
                // Giữ nguyên logic đổi màu theo sub-tab của Cado
                const isGiaoLuu = window.state.cadoSubTab === 'giaoluu';
                fab.className = isGiaoLuu ? 'fab-btn bg-primary show' : 'fab-btn bg-success show';
                fab.innerHTML = '<i class="fas fa-plus"></i>';
            } else if(tabId === 'chi') { 
                // Nút Chi Quỹ dùng màu đỏ
                fab.className = 'fab-btn bg-danger show'; 
                fab.innerHTML = '<i class="fas fa-plus"></i>'; 
            } else { 
                fab.className = 'fab-btn'; 
            }
        };

        window.handleFabClick = () => {
            if(window.state.activeTab === 'cado') {
                if(window.state.cadoSubTab === 'giaoluu') window.openAddIncomeModal();
                else if(window.state.cadoSubTab === 'cado') window.openAddMatchModal();
                else if(window.state.cadoSubTab === 'kyluat') window.openAddPenaltyModal();
                else if(window.state.cadoSubTab === 'lienhoan') window.openAddPartyModal();
            }
            else if(window.state.activeTab === 'chi') { window.openAddExpenseModal(); }
        };
        
        document.getElementById('monthSelectorMain').addEventListener('change', (e) => handleMonthChange(e.target.value));
        document.getElementById('monthSelectorCompact').addEventListener('change', (e) => handleMonthChange(e.target.value));

        function handleMonthChange(newMonth) {
            window.state.currentMonth = newMonth;
            document.getElementById('monthSelectorMain').value = newMonth;
            document.getElementById('monthSelectorCompact').value = newMonth;
            window.state.monthData = window.state.allFundsData[window.state.currentMonth] || { regular: {}, regular_notes: {}, betting: {}, expenses: {} };
            renderAll();
        }

        // ================= TỰ ĐỘNG ẨN THANH DOCK KHI CUỘN (CHỐNG GIẬT) =================
        let lastScrollY = window.scrollY;
        window.addEventListener('scroll', () => {
            const nav = document.getElementById('mainBottomNav');
            const fab = document.getElementById('globalFabBtn');
            if (!nav) return;

            const currentScrollY = window.scrollY;
            const scrollDiff = currentScrollY - lastScrollY;

            // Bỏ qua các dao động nhỏ hơn 10px để chống giật trên màn hình cảm ứng
            if (Math.abs(scrollDiff) < 10) return;

            if (scrollDiff > 0 && currentScrollY > 60) {
                // Đang vuốt xuống sâu -> Ẩn Dock
                nav.classList.add('dock-hidden');
                if (fab) fab.classList.add('dock-hidden');
            } else if (scrollDiff < 0 || currentScrollY <= 60) {
                // Đang vuốt ngược lên hoặc ở sát đầu trang -> Hiện lại Dock
                nav.classList.remove('dock-hidden');
                if (fab) fab.classList.remove('dock-hidden');
            }
            
            lastScrollY = currentScrollY;
        }, { passive: true });
		// ================= XUẤT ẢNH THẺ CẦU THỦ =================
        window.exportPlayerCard = () => {
            const btn = document.getElementById('btnExportCard');
            const oldHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Đang in thẻ...';
            
            const exportZone = document.getElementById('player-card-export-zone');
            const selectEl = document.getElementById('radarPlayerSelect');
            const playerName = selectEl.options[selectEl.selectedIndex].text;
            
            setTimeout(() => {
                html2canvas(exportZone, { scale: 4, useCORS: true, backgroundColor: '#f4f7f6' }).then(canvas => {
                    canvas.toBlob((blob) => {
                        if(!blob) return btn.innerHTML = oldHtml;
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.download = `The_FIFA_${playerName}.png`;
                        link.href = url;
                        link.click();
                        URL.revokeObjectURL(url);
                        btn.innerHTML = oldHtml;
                    });
                });
            }, 300);
        };
		window.checkFundBalance = () => {
            const amt = window.getRealNumber('expAmount');
            const warn = document.getElementById('expWarning');
            const input = document.getElementById('expAmount');
            if(amt > (window.state.currentBalance || 0)) {
                warn.style.display = 'block'; input.classList.add('input-danger');
            } else {
                warn.style.display = 'none'; input.classList.remove('input-danger');
            }
        };
		// ================= XUẤT ẢNH BILL NHẬU =================
        window.exportPartyCard = () => {
            const pId = window.state.bsPartyId;
            const p = window.state.monthData.parties?.[pId]; if(!p) return;
            
            const btn = document.getElementById('btnExportPartyCard');
            const oldHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang vẽ...';

            // Đổ dữ liệu vào vùng thiết kế ẩn
            document.getElementById('exp-party-name').innerText = p.name;
            document.getElementById('exp-party-date').innerText = `Ngày: ${p.date || '---'}`;
            document.getElementById('exp-party-total').innerText = window.formatMoney(p.bill);
            document.getElementById('exp-party-per').innerText = window.formatMoney(p.perPerson);

            let listHtml = '';
            Object.entries(window.state.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).forEach(([tId, t]) => {
                let teamHasMember = false;
                let teamItems = '';
                
                Object.keys(p.members || {}).forEach(mId => {
                    const m = window.state.members[mId];
                    if(m && m.teamId === tId) {
                        teamHasMember = true;
                        const paidAmt = Number(p.members[mId]) || 0;
                        const isPaid = paidAmt >= p.perPerson;
                        
                        let statusBadge = isPaid 
                            ? `<span style="background: #d1e7dd; color: #0f5132; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold;">Đã đóng ✅</span>` 
                            : `<span style="background: #f8d7da; color: #842029; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold;">Chưa đóng ❌</span>`;
                        
                        teamItems += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #ffffff; border-bottom: 1px solid #f1f3f5; border-radius: 6px; margin-bottom: 4px;">
                            <span style="font-weight: 700; color: #212529; font-size: 13px;">${m.name}</span>
                            ${statusBadge}
                        </div>`;
                    }
                });

                if(teamHasMember) {
                    listHtml += `<div style="font-size: 11px; font-weight: 800; color: #198754; text-transform: uppercase; margin-top: 8px; margin-bottom: 4px;">${t.name}</div>` + teamItems;
                }
            });

            document.getElementById('exp-party-member-list').innerHTML = listHtml;

            // Tiến hành chụp ảnh bằng html2canvas
            setTimeout(() => {
                const exportZone = document.getElementById('party-card-export-zone');
                html2canvas(exportZone, { scale: 4, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            alert('Lỗi bộ nhớ khi tạo ảnh.');
                            btn.innerHTML = oldHtml;
                            return;
                        }
                        
                        const fileName = `Bill_Nhau_${p.name.replace(/\s+/g, '_')}.png`;
                        const file = new File([blob], fileName, { type: 'image/png' });

                        // Kiểm tra nếu thiết bị hỗ trợ share file trực tiếp
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            navigator.share({
                                files: [file],
                                title: 'Bill Nhậu FC Thập Cẩm',
                                text: `Gửi anh em bill "${p.name}" (${window.formatMoney(p.perPerson)}/người) nhé!`
                            }).then(() => {
                                btn.innerHTML = oldHtml;
                            }).catch(() => {
                                btn.innerHTML = oldHtml;
                            });
                        } else {
                            // Tải xuống file ảnh nếu không hỗ trợ share trực tiếp
                            const objUrl = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.download = fileName;
                            link.href = objUrl;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(objUrl);
                            
                            btn.innerHTML = oldHtml;
                        }
                    }, 'image/png');
                }).catch(err => {
                    alert('Lỗi khi vẽ ảnh bill.');
                    console.error(err);
                    btn.innerHTML = oldHtml;
                });
            }, 300);
        };
		// ================= XỬ LÝ NHIỀU ẢNH HÓA ĐƠN LIÊN HOAN =================
        window.handleMultiplePartyBills = (event) => {
            const files = event.target.files;
            if (!files || files.length === 0) return;
            
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_SIZE = 1000; // Resize ảnh để không nặng DB
                        let width = img.width; let height = img.height;
                        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                        canvas.width = width; canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        window.tempPartyBills.push(canvas.toDataURL('image/jpeg', 0.8));
                        window.renderPartyBillGallery();
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
            event.target.value = ''; // Reset input file
        };

        window.renderPartyBillGallery = () => {
            const gallery = document.getElementById('partyBillGallery');
            const placeholder = document.getElementById('partyBillPlaceholder');
            
            if (window.tempPartyBills.length === 0) {
                gallery.innerHTML = '';
                gallery.appendChild(placeholder);
                placeholder.style.display = 'block';
                return;
            }
            
            let html = '';
            window.tempPartyBills.forEach((b64, idx) => {
                html += `
                <div class="position-relative flex-shrink-0 shadow-sm" style="width: 55px; height: 55px; border-radius: 8px; overflow: hidden; border: 1px solid #ced4da;">
                    <img src="${b64}" style="width: 100%; height: 100%; object-fit: cover;">
                    <div class="position-absolute top-0 end-0 bg-danger text-white d-flex align-items-center justify-content-center" style="width: 20px; height: 20px; border-bottom-left-radius: 8px; cursor: pointer; font-size: 11px;" onclick="removePartyBill(${idx})"><i class="fas fa-times"></i></div>
                </div>`;
            });
            gallery.innerHTML = html;
        };

        window.removePartyBill = (idx) => {
            window.tempPartyBills.splice(idx, 1);
            window.renderPartyBillGallery();
        };

        window.openBillImageViewer = () => {
            const pId = window.state.bsPartyId;
            const p = window.state.monthData.parties?.[pId];
            if (!p) return;

            let images = [];
            if (p.billImages && Array.isArray(p.billImages)) images = p.billImages;
            else if (p.billImage) images = [p.billImage];

            if (images.length === 0) return;

            let html = '';
            images.forEach(imgData => {
                html += `<img class="party-bill-preview-modal shadow-sm mb-2 border" src="${imgData}">`;
            });
            document.getElementById('modalBillImageFullContainer').innerHTML = html;
            new bootstrap.Modal(document.getElementById('modalViewBillImg')).show();
        };
        initApp();
		