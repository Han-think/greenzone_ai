// 같은 탭에서 메뉴를 펼친 상태만 기억한다. 검색어·주소·인증 정보는 저장하지 않는다.
function menuIsOpen(key) {
    try { return sessionStorage.getItem(key) === 'true'; }
    catch (error) { return false; }
}

function rememberMenu(key, open) {
    try { sessionStorage.setItem(key, String(open)); }
    catch (error) { /* 저장이 제한된 브라우저에서도 메뉴는 사용할 수 있다. */ }
}

// 메뉴 접기와 관리자 로그인 상태만 관리한다. 권한 검사는 서버에서도 수행한다.
document.addEventListener('DOMContentLoaded', async function() {
    var toggle = document.getElementById('menuToggle');
    var mobileOpen = menuIsOpen('greenzone-mobile-menu-open');
    toggle.setAttribute('aria-expanded', String(mobileOpen));
    document.getElementById('navLinks').classList.toggle('menu-open', mobileOpen);
    var adminGroup = document.getElementById('adminNav');
    if (adminGroup) {
        adminGroup.open = menuIsOpen('greenzone-admin-menu-open');
        adminGroup.addEventListener('toggle', function() {
            rememberMenu('greenzone-admin-menu-open', this.open);
        });
    }
    toggle.onclick = function() {
        var open = this.getAttribute('aria-expanded') !== 'true';
        this.setAttribute('aria-expanded', String(open));
        rememberMenu('greenzone-mobile-menu-open', open);
        document.getElementById('navLinks').classList.toggle('menu-open', open);
    };
    var current = document.querySelector('.app-nav .active');
    if (current) current.setAttribute('aria-current', 'page');
    try {
        var response = await fetch('/api/admin/session', {cache: 'no-store'});
        if (response.ok) {
            document.getElementById('adminEntry').textContent = '관리자 화면';
            var adminNav = document.getElementById('adminNav');
            if (adminNav) adminNav.hidden = false;
            var loginEntry = document.getElementById('adminLoginEntry');
            if (loginEntry) loginEntry.hidden = true;
        } else if (response.status === 401) {
            rememberMenu('greenzone-admin-menu-open', false);
            if (adminGroup) adminGroup.open = false;
        }
    } catch (error) { /* 연결 실패 시 로그인 링크를 유지한다. */ }
    var logout = document.getElementById('navLogout');
    if (logout) logout.onclick = async function() {
        var response = await fetch('/api/admin/logout', {method: 'POST', headers: {'X-GreenZone-Admin': '1'}});
        if (response.ok || response.status === 401) {
            rememberMenu('greenzone-admin-menu-open', false);
            location.href = '/admin';
        }
        else alert('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    };
});
