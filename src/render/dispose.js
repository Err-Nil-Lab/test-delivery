// Melepas geometry & material milik objek yang dibuat sementara (marker, telegraph).
// Material/geometry bersama yang ditandai userData.shared tidak dilepas.
// Label CSS2D anak tidak ikut terhapus dari DOM saat parent-nya dilepas, jadi dihapus di sini.
export function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.isCSS2DObject) obj.element.remove();
    if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
    if (obj.material && !obj.material.userData.shared) obj.material.dispose();
  });
}
