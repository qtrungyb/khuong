window.state = {
            members: {}, teams: {}, 
            monthData: { regular: {}, regular_notes: {}, betting: {}, expenses: {} },
            allFundsData: {}, globalSettings: { defaultFund: 100000 },
            currentMonth: new Date().toISOString().slice(0, 7),
            activeTab: 'thu', currentFilter: 'all',
            bsMatchId: null 
        };
        
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
            const words = name.trim().split(' ');
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
                if (snapshot.exists()) window.state.globalSettings = snapshot.val();
                document.getElementById('displayDefaultFund').innerText = window.formatMoney(window.state.globalSettings.defaultFund || 100000);
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
                    prevTotal += (tQ + tC - tChi);
                }
            }); return prevTotal;
        }

        function renderAll() { 
            renderThuQuy(); renderCaDo(); renderGiaoLuu(); renderChi(); renderTongKet(); renderThongKe();
            if(window.state.bsMatchId) renderBottomSheetContent(); 
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
            
            let html = ''; let totalMembers = 0; let totalPaid = 0;
            
            Object.entries(window.state.teams).sort((a,b) => (a[1].order||0) - (b[1].order||0)).forEach(([tId, tData]) => {
                let unpaids = []; let paids = []; let tMoney = 0; let tCount = 0;
                
                Object.entries(window.state.members).forEach(([mId, m]) => {
                    if(m.teamId === tId) {
                        const paidAmt = Number(window.state.monthData.regular?.[mId]) || 0;
                        const note = window.state.monthData.regular_notes?.[mId] || '';
                        tCount++; totalMembers++;
                        if(searchKeyword && !m.name.toLowerCase().includes(searchKeyword)) return;
                        if(paidAmt > 0) { totalPaid++; tMoney += paidAmt; paids.push({id: mId, name: m.name, amt: paidAmt, note, avatar: m.avatar}); } 
                        else unpaids.push({id: mId, name: m.name, avatar: m.avatar});
                    }
                });

                if(unpaids.length > 0 || paids.length > 0) {
                    const dispUnpaid = (filter === 'all' || filter === 'unpaid') ? unpaids : [];
                    const dispPaid = (filter === 'all' || filter === 'paid') ? paids : [];

                    html += `
                    <div class="d-flex justify-content-between align-items-end mt-4 mb-2 px-1">
                        <span class="fw-bold text-success text-uppercase border-start border-success border-4 ps-2">${tData.name}</span>
                        <small class="text-primary fw-bold bg-white px-2 py-1 rounded-pill shadow-sm">Tổng: ${window.formatMoney(tMoney)}</small>
                    </div>`;

                    if(dispUnpaid.length > 0) {
                        html += `<div class="avatar-grid">`;
                        dispUnpaid.forEach(m => {
                            let avatarContent = m.avatar ? `<img src="${m.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : window.getInitials(m.name);
                            html += `
                            <div class="avatar-item" onclick="toggleRegularFund('${m.id}', ${defaultFund}, true)" oncontextmenu="handleLongPress(event, '${m.id}', '${m.name}', ${defaultFund})">
                                <div class="avatar-circle avatar-unpaid">${avatarContent}</div>
                                <span class="avatar-name">${m.name}</span>
                            </div>`;
                        });
                        html += `</div>`;
                    }

                    if(dispPaid.length > 0) {
                        if(filter === 'paid' || searchKeyword) {
                            html += `<div class="avatar-grid">`;
                            dispPaid.forEach(m => {
                                let avatarContent = m.avatar ? `<img src="${m.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : window.getInitials(m.name);
                                html += `<div class="avatar-item" onclick="toggleRegularFund('${m.id}', null, false)" oncontextmenu="handleLongPress(event, '${m.id}', '${m.name}', ${m.amt})"><div class="avatar-circle avatar-paid">${avatarContent}${(m.note || m.amt !== defaultFund) ? '<div class="avatar-badge-edit"><i class="fas fa-pen"></i></div>' : ''}</div><span class="avatar-name">${m.name}</span></div>`;
                            });
                            html += `</div>`;
                        } else {
                            html += `
                            <div class="bg-white rounded-3 p-2 text-center text-muted fw-bold small shadow-sm mb-3" style="cursor:pointer;" onclick="this.nextElementSibling.classList.toggle('d-none');">
                                <i class="fas fa-check-circle text-success me-1"></i> Đã nộp (${dispPaid.length} người) <i class="fas fa-chevron-down ms-1"></i>
                            </div>
                            <div class="avatar-grid d-none">`;
                            dispPaid.forEach(m => {
                                let avatarContent = m.avatar ? `<img src="${m.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : window.getInitials(m.name);
                                html += `<div class="avatar-item" onclick="toggleRegularFund('${m.id}', null, false)" oncontextmenu="handleLongPress(event, '${m.id}', '${m.name}', ${m.amt})"><div class="avatar-circle avatar-paid">${avatarContent}${(m.note || m.amt !== defaultFund) ? '<div class="avatar-badge-edit"><i class="fas fa-pen"></i></div>' : ''}</div><span class="avatar-name">${m.name}</span></div>`;
                            });
                            html += `</div>`;
                        }
                    }
                }
            });

            document.getElementById('thu-summary-badge').innerText = `${totalPaid}/${totalMembers} Đã nộp`;
            container.innerHTML = html || '<div class="text-center text-muted mt-5">Không có dữ liệu.</div>';
        };

        window.handleLongPress = (e, mId, mName, amt) => {
            e.preventDefault(); 
            window.openCustomFund(mId, mName, amt);
        };

        window.toggleRegularFund = (mId, amt, isAdding) => {
            if (isAdding) {
                db.ref(`funds/${window.state.currentMonth}/regular/${mId}`).set(amt);
            } else {
                db.ref(`funds/${window.state.currentMonth}/regular/${mId}`).remove();
                db.ref(`funds/${window.state.currentMonth}/regular_notes/${mId}`).remove();
            }
        };

        window.openCustomFund = (mId, mName, amt) => {
            document.getElementById('customFundMemId').value = mId; document.getElementById('customFundMemName').innerText = mName;
            document.getElementById('inputCustomFund').value = amt;
            document.getElementById('inputCustomNote').value = window.state.monthData.regular_notes?.[mId] || '';
            new bootstrap.Modal(document.getElementById('modalCustomFund')).show();
        };

        window.saveCustomFund = () => {
            const mId = document.getElementById('customFundMemId').value;
            const amt = window.getRealNumber('inputCustomFund');
            const note = document.getElementById('inputCustomNote').value.trim();
            if(amt > 0) {
                db.ref().update({
                    [`funds/${window.state.currentMonth}/regular/${mId}`]: amt,
                    [`funds/${window.state.currentMonth}/regular_notes/${mId}`]: note || null
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

                            let tickClass = isPaid ? 'tick-btn active' : 'tick-btn unpaid';
                            let tickIcon = isPaid ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>';

                            teamHtml += `
                            <div class="item-clean ${isPaid ? 'member-paid' : 'member-unpaid'}" onclick="toggleBettingStatus('${matchId}', '${mId}', ${matchTotal}, ${isPaid})">
                                <div class="mem-name ${isPaid ? 'text-muted text-decoration-line-through' : ''}">${m.name}</div>
                                <div class="${tickClass}">${tickIcon}</div>
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

        // ================= CHUYỂN NHÁNH TRONG TAB ĐỘ & GIAO LƯU =================
        window.state.cadoSubTab = 'giaoluu'; 

        window.switchCadoSubTab = (subTab) => {
            window.state.cadoSubTab = subTab;
            const viewCado = document.getElementById('subtab-cado-view');
            const viewGiaoluu = document.getElementById('subtab-giaoluu-view');
            const cardCado = document.getElementById('card-sub-cado');
            const cardGiaoluu = document.getElementById('card-sub-giaoluu');
            const iconCado = document.getElementById('icon-sub-cado');
            const iconGiaoluu = document.getElementById('icon-sub-giaoluu');
            const fab = document.getElementById('globalFabBtn');

            if (subTab === 'cado') {
                viewCado.classList.remove('d-none');
                viewGiaoluu.classList.add('d-none');
                cardCado.classList.add('active-cado');
                cardGiaoluu.classList.remove('active-giaoluu');
                iconCado.classList.remove('d-none');
                iconGiaoluu.classList.add('d-none');
                if (window.state.activeTab === 'cado') fab.className = 'fab-btn bg-success show';
            } else {
                viewCado.classList.add('d-none');
                viewGiaoluu.classList.remove('d-none');
                cardCado.classList.remove('active-cado');
                cardGiaoluu.classList.add('active-giaoluu');
                iconCado.classList.add('d-none');
                iconGiaoluu.classList.remove('d-none');
                if (window.state.activeTab === 'cado') fab.className = 'fab-btn bg-primary show';
            }
        };

        // ================= GIAO LƯU & THU KHÁC =================
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

            document.getElementById('giaoluu-thu-header').innerText = window.formatMoney(totalInc);
            document.getElementById('giaoluu-sub-header').innerText = `${incEntries.length} khoản thu`;

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
            
            let totalExp = 0; 
            expEntries.forEach(([_, exp]) => totalExp += (Number(exp.amount)||0));
            
            document.getElementById('chi-total-header').innerText = window.formatMoney(totalExp); 
            document.getElementById('chi-count-label').innerText = `${expEntries.length} khoản chi`; 
            
            if(expEntries.length === 0) {
                container.innerHTML = '<div class="card-clean border p-4 text-center text-muted small"><i class="fas fa-box-open fa-2x mb-2 opacity-25"></i><br>Chưa có khoản chi nào trong tháng.</div>';
                return;
            }
            
            // Dùng Timeline giống tab Giao Lưu
            let html = '<div class="timeline-container">';
            expEntries.sort((a,b) => new Date(b[1].rawDate || 0) - new Date(a[1].rawDate || 0)).forEach(([expId, exp]) => { 
                // Tự động phân loại Icon giống Giao Lưu
                let iconClass = 'bg-secondary'; let iconItem = 'fa-receipt';
                const descLower = exp.desc.toLowerCase();
                if(descLower.includes('sân')) { iconItem = 'fa-futbol'; iconClass = 'bg-primary';}
                else if(descLower.includes('nước') || descLower.includes('đá')) { iconItem = 'fa-tint'; iconClass = 'bg-info';}
                else if(descLower.includes('áo') || descLower.includes('bóng')) { iconItem = 'fa-tshirt'; iconClass = 'bg-warning'; }
                else if(descLower.includes('y tế') || descLower.includes('băng')) { iconItem = 'fa-medkit'; iconClass = 'bg-danger'; }

                html += `
                <div class="timeline-item">
                    <div class="timeline-icon ${iconClass}"><i class="fas ${iconItem} text-white"></i></div>
                    <div class="timeline-content">
                        <div class="timeline-title">${exp.desc}</div>
                        <div class="timeline-date"><i class="far fa-calendar-times text-danger"></i> ${exp.date}</div>
                        <div class="timeline-actions">
                            <div class="tl-btn edit" onclick="openEditExpenseModal('${expId}')"><i class="fas fa-pen"></i></div>
                            <div class="tl-btn delete" onclick="deleteExpense('${expId}')"><i class="fas fa-trash"></i></div>
                        </div>
                    </div>
                    <div class="timeline-amount" style="background:#f8d7da; color:#dc3545; border:1px solid #f5c2c7;">-${window.formatShortMoney(exp.amount)}</div>
                </div>`;
            });
            container.innerHTML = html + '</div>';
        }

        // ================= TAB 4: TỔNG KẾT =================
        function renderTongKet() {
            const defaultFund = window.state.globalSettings.defaultFund || 100000;
            let thuQuy = 0, thuCaDo = 0, tongChi = 0; 
            
            const memberDebts = {};
            const memberContributions = {}; 
            
            Object.entries(window.state.members).forEach(([mId, m]) => {
                memberDebts[mId] = { name: m.name, teamName: window.state.teams[m.teamId]?.name || '', quyDebt: 0, cadoDebt: 0, cadoCount: 0 };
                memberContributions[mId] = { name: m.name, totalPaid: 0 };
            });

            let unpaidQuyCount = 0; let unpaidCadoPeopleCount = 0;
            
            Object.entries(window.state.members).forEach(([mId, _]) => { 
                const paid = Number(window.state.monthData.regular?.[mId]) || 0;
                if(paid > 0) { 
                    thuQuy += paid; 
                    if(memberContributions[mId]) memberContributions[mId].totalPaid += paid;
                } else if(memberDebts[mId]) { 
                    memberDebts[mId].quyDebt = defaultFund; 
                    unpaidQuyCount++; 
                }
            });
            
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
            
            let thuKhac = 0;
            Object.values(window.state.monthData.expenses || {}).forEach(exp => {
                if (exp.type === 'thu') {
                    thuKhac += (Number(exp.amount) || 0);
                    miniLogs.push({ type: 'giaoluu', desc: exp.desc, amt: Number(exp.amount), date: exp.rawDate || exp.date });
                } else {
                    tongChi += (Number(exp.amount) || 0);
                    miniLogs.push({ type: 'chi', desc: exp.desc, amt: Number(exp.amount), date: exp.rawDate || exp.date });
                }
            });

            const tonQuyThangTruoc = getCarryOverFund(window.state.currentMonth);
            const tongThu = thuQuy + thuCaDo + thuKhac;
            const tongHienTai = tonQuyThangTruoc + tongThu - tongChi;
            
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

            const logContainer = document.getElementById('tk-recent-log');
            if (logContainer) {
                miniLogs.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
                const recentLogs = miniLogs.slice(0, 4);

                if (recentLogs.length === 0) {
                    logContainer.innerHTML = '<div class="p-4 text-center text-muted small fst-italic">Chưa có giao dịch phát sinh.</div>';
                } else {
                    let htmlLog = '';
                    recentLogs.forEach(lg => {
                        let icon, color, sign, bg;
                        if(lg.type === 'giaoluu') { icon = 'fa-handshake'; color = 'text-primary'; bg = 'bg-primary'; sign = '+'; }
                        else if(lg.type === 'chi') { icon = 'fa-receipt'; color = 'text-danger'; bg = 'bg-danger'; sign = '-'; }
                        else { icon = 'fa-dice'; color = 'text-success'; bg = 'bg-success'; sign = '+'; }
                        
                        htmlLog += `
                        <div class="d-flex justify-content-between align-items-center p-3 border-bottom" style="background: white;">
                            <div class="d-flex align-items-center gap-3 text-truncate">
                                <div class="${bg} bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width:36px; height:36px;"><i class="fas ${icon} ${color}"></i></div>
                                <div class="text-truncate">
                                    <div class="fw-bold text-dark text-truncate" style="font-size:13px;">${lg.desc}</div>
                                    <div class="text-muted" style="font-size:10px;"><i class="far fa-calendar-alt"></i> ${lg.date || 'Trong tháng'}</div>
                                </div>
                            </div>
                            <div class="fw-bold ${color} flex-shrink-0 ms-2" style="font-size: 14px;">${sign}${window.formatShortMoney(lg.amt)}</div>
                        </div>`;
                    });
                    logContainer.innerHTML = htmlLog;
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
            
            const debtors = Object.entries(memberDebts).map(([mId, d]) => { if(d.cadoDebt > 0) unpaidCadoPeopleCount++; return { mId, ...d, totalDebt: d.quyDebt + d.cadoDebt }; }).filter(d => d.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt);
            document.getElementById('tk-tongno-badge').innerText = window.formatMoney(debtors.reduce((sum, d) => sum + d.totalDebt, 0));
            document.getElementById('tk-debt-sub').innerText = `Nợ quỹ: ${unpaidQuyCount} • Nợ độ: ${unpaidCadoPeopleCount}`;

            if(debtors.length === 0) {
                document.getElementById('tk-bangtongno').innerHTML = '<div class="text-success fw-bold p-4 text-center"><i class="fas fa-check-circle me-1"></i> Xong! Không còn ai nợ.</div>';
            } else {
                let htmlDebt = '';
                debtors.forEach(d => {
                    let tagsHtml = '';
                    if(d.quyDebt > 0) tagsHtml += `<span class="debt-tag debt-tag-quy">Quỹ ${window.formatShortMoney(d.quyDebt)}</span>`;
                    if(d.cadoDebt > 0) tagsHtml += `<span class="debt-tag debt-tag-cado">Độ ${window.formatShortMoney(d.cadoDebt)} (${d.cadoCount}t)</span>`;
                    
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
        }

        window.settleAllMemberDebt = (mId, mName, totalDebt) => {
            if(!confirm(`Xác nhận đã thu ${window.formatMoney(totalDebt)} của ${mName}?`)) return;
            const defaultFund = window.state.globalSettings.defaultFund || 100000; const updates = {};
            if((Number(window.state.monthData.regular?.[mId]) || 0) <= 0) updates[`funds/${window.state.currentMonth}/regular/${mId}`] = Number(defaultFund);
            Object.entries(window.state.monthData.betting || {}).forEach(([matchId, match]) => {
                const matchTotal = Number(match.penalty_amount) || 0;
                if(match.losers && match.losers[mId] !== undefined && Number(match.losers[mId]) < matchTotal) updates[`funds/${window.state.currentMonth}/betting/${matchId}/losers/${mId}`] = matchTotal;
            }); db.ref().update(updates);
        };

        // ================= THỐNG KÊ =================
        function renderThongKe() {
            const container = document.getElementById('stat-container');
            const betting = window.state.monthData.betting || {};
            const matchIds = Object.keys(betting);
            
            document.getElementById('stat-total-matches').innerText = `${matchIds.length} trận đấu`;
            if(matchIds.length === 0) return container.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-box-open fa-2x mb-2 opacity-25"></i><br>Chưa có dữ liệu thi đấu tháng này.</div>';

            const stats = {};
            Object.keys(window.state.members).forEach(mId => { stats[mId] = { name: window.state.members[mId].name, win: 0, lose: 0, skip: 0 }; });

            matchIds.forEach(mId => {
                const match = betting[mId];
                Object.keys(stats).forEach(memId => {
                    if((match.winners||{})[memId]) stats[memId].win++;
                    else if((match.losers||{})[memId] !== undefined) stats[memId].lose++;
                    else stats[memId].skip++;
                });
            });

            const activeStats = Object.values(stats).filter(s => (s.win + s.lose) > 0).sort((a, b) => b.win - a.win || a.lose - b.lose);
            if(activeStats.length === 0) return container.innerHTML = '<div class="text-center text-muted p-4">Chưa có ai tham gia thi đấu.</div>';

            let html = '';
            activeStats.forEach((s, index) => {
                const totalPlayed = s.win + s.lose; const winRate = Math.round((s.win / totalPlayed) * 100);
                let rankHtml = `<span class="text-muted fw-bold" style="width:20px;">#${index+1}</span>`;
                if(index === 0) rankHtml = `<i class="fas fa-medal text-warning" style="font-size:18px; width:20px;"></i>`;
                else if(index === 1) rankHtml = `<i class="fas fa-medal text-secondary" style="font-size:18px; width:20px;"></i>`;
                else if(index === 2) rankHtml = `<i class="fas fa-medal" style="color: #cd7f32; font-size:18px; width:20px;"></i>`;

                html += `<div class="stat-item bg-white"><div class="d-flex justify-content-between align-items-center mb-1"><div class="d-flex align-items-center gap-2">${rankHtml}<span class="fw-bold text-dark">${s.name}</span></div><div class="d-flex gap-2 text-center" style="font-size:11px;"><div class="bg-success bg-opacity-10 text-success rounded px-2 py-1"><strong>${s.win}</strong> T</div><div class="bg-danger bg-opacity-10 text-danger rounded px-2 py-1"><strong>${s.lose}</strong> B</div><div class="bg-secondary bg-opacity-10 text-secondary rounded px-2 py-1"><strong>${s.skip}</strong> N</div></div></div><div class="d-flex align-items-center gap-2 mt-1"><span class="small text-muted fw-bold" style="font-size:10px; width:25px;">${winRate}%</span><div class="stat-bar flex-grow-1"><div class="bg-success" style="width: ${winRate}%"></div><div class="bg-danger" style="width: ${100 - winRate}%"></div></div></div></div>`;
            });
            container.innerHTML = html;
        }

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
            if(!select) return;
            select.innerHTML = Object.entries(window.state.teams)
                .sort((a,b) => (a[1].order||0) - (b[1].order||0))
                .map(([id, t]) => `<option value="${id}">${t.name}</option>`).join('');
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
                    quyDebt: 0, cadoDebt: 0,
                    owedMatches: [] 
                };
            });

            Object.entries(window.state.members).forEach(([mId, m]) => {
                const paid = Number(window.state.monthData.regular?.[mId]) || 0;
                if (paid > 0) { reportData[mId].quyPaid = paid; thuQuy += paid; } 
                else if (reportData[mId]) { reportData[mId].quyDebt = defaultFund; }
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

            Object.values(window.state.monthData.expenses || {}).forEach(exp => {
                if (exp.type === 'thu') thuKhac += (Number(exp.amount) || 0);
                else tongChi += (Number(exp.amount) || 0);
            });

            const tonQuyThangTruoc = getCarryOverFund(window.state.currentMonth);
            const tongHienTai = tonQuyThangTruoc + thuQuy + thuCaDo + thuKhac - tongChi;

            const paidList = [];
            const debtList = [];

            Object.values(reportData).forEach(d => {
                const totalPaid = d.quyPaid + d.cadoPaid;
                const totalDebt = d.quyDebt + d.cadoDebt;
                
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

        window.switchTab = (tabId, element) => {
            window.state.activeTab = tabId;
            
            const headerFull = document.getElementById('headerFull');
            const headerCompact = document.getElementById('headerCompact');
            const titleElement = document.getElementById('headerTabTitle');

            if(tabId === 'thu') {
                headerFull.style.display = 'flex';
                headerCompact.style.display = 'none';
            } else if (tabId !== 'cai-dat') {
                headerFull.style.display = 'none';
                headerCompact.style.display = 'flex';
                if(tabId === 'cado') titleElement.innerText = 'CÁ ĐỘ & GIAO LƯU';
                else if(tabId === 'chi') titleElement.innerText = 'CHI QUỸ';
                else if(tabId === 'tongket') titleElement.innerText = 'TỔNG KẾT';
                else if(tabId === 'thongke') titleElement.innerText = 'THỐNG KÊ';
            } else {
                headerFull.style.display = 'none';
                headerCompact.style.display = 'none';
            }

            document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');
            
            if(element) { 
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                element.classList.add('active');
            }

            const fab = document.getElementById('globalFabBtn');
            if(tabId === 'cado') {
                const isGiaoLuu = window.state.cadoSubTab === 'giaoluu';
                fab.className = isGiaoLuu ? 'fab-btn bg-primary show' : 'fab-btn bg-success show';
                fab.innerHTML = '<i class="fas fa-plus"></i>';
            } else if(tabId === 'chi') { 
                fab.className = 'fab-btn bg-danger show'; 
                fab.innerHTML = '<i class="fas fa-plus"></i>'; 
            } else { 
                fab.className = 'fab-btn'; 
            }
        };

        window.handleFabClick = () => {
            if(window.state.activeTab === 'cado') {
                if(window.state.cadoSubTab === 'giaoluu') window.openAddIncomeModal();
                else window.openAddMatchModal();
            }
            else if(window.state.activeTab === 'chi') {
                window.openAddExpenseModal();
            }
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

        initApp();