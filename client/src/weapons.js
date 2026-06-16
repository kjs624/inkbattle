// Weapon definitions shared by the host sim (damage/paint/fire-rate) and the
// client (viewmodel/bullets/HUD). Each has clear trade-offs.
//
//  소총   균형: 무난한 데미지·연사·사거리
//  기관단총 빠른 연사·약한 데미지·짧은 사거리 (근접 도배에 강함)
//  스나이퍼 한 방·아주 긴 사거리·느린 연사·도색 적음
//  샷건   펠릿 9발 퍼짐·근접 폭딜·넓게 도색·긴 쿨다운 (원거리 약함)

export const WEAPONS = {
  rifle:   { key: 'rifle',   name: '소총',     dmg: 28,  cooldown: 0.11, range: 26, brush: 2.2, pellets: 1, spread: 0.015, bulletSpeed: 110, gunColor: 0x4ade80, len: 1.0 },
  smg:     { key: 'smg',     name: '기관단총', dmg: 13,  cooldown: 0.05, range: 16, brush: 1.6, pellets: 1, spread: 0.055, bulletSpeed: 95,  gunColor: 0x60a5fa, len: 0.8 },
  sniper:  { key: 'sniper',  name: '스나이퍼', dmg: 100, cooldown: 1.1,  range: 80, brush: 1.5, pellets: 1, spread: 0.0,   bulletSpeed: 260, gunColor: 0xf472b6, len: 1.6 },
  shotgun: { key: 'shotgun', name: '샷건',     dmg: 14,  cooldown: 0.8,  range: 14, brush: 1.9, pellets: 9, spread: 0.22,  bulletSpeed: 80,  gunColor: 0xfbbf24, len: 1.1 },
};

// Selection order for number keys 1..4.
export const WEAPON_ORDER = ['rifle', 'smg', 'sniper', 'shotgun'];

export function getWeapon(key) {
  return WEAPONS[key] || WEAPONS.rifle;
}
