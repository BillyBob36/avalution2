import cv2
import os

VIDEOS = [
    {
        'src': 'vids/idle/idle-normal-B.mp4',
        'output_dir': 'frames/idle'
    },
    {
        'src': 'vids/speek/speek2.mp4',
        'output_dir': 'frames/speek'
    }
]

QUALITIES = {
    'full': 1.0,
    'demi': 0.5,
    'quart': 0.25
}

JPG_QUALITY = 80

def extract_frames(video_path, output_base_dir):
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Erreur: Impossible d'ouvrir {video_path}")
        return
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"Vidéo: {video_path}")
    print(f"  FPS: {fps}, Frames: {frame_count}, Taille: {width}x{height}")
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        for quality_name, scale in QUALITIES.items():
            output_dir = os.path.join(output_base_dir, quality_name)
            
            if scale != 1.0:
                new_width = int(width * scale)
                new_height = int(height * scale)
                resized = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
            else:
                resized = frame
            
            filename = os.path.join(output_dir, f"frame_{frame_idx:04d}.jpg")
            cv2.imwrite(filename, resized, [cv2.IMWRITE_JPEG_QUALITY, JPG_QUALITY])
        
        frame_idx += 1
        if frame_idx % 30 == 0:
            print(f"  Extrait {frame_idx}/{frame_count} frames...")
    
    cap.release()
    print(f"  Terminé: {frame_idx} frames extraites")
    return frame_idx, fps

if __name__ == "__main__":
    info = {}
    
    for video in VIDEOS:
        print(f"\nTraitement de {video['src']}...")
        result = extract_frames(video['src'], video['output_dir'])
        if result:
            frame_count, fps = result
            name = os.path.basename(video['output_dir'])
            info[name] = {'frames': frame_count, 'fps': fps}
    
    print("\n=== Résumé ===")
    for name, data in info.items():
        print(f"{name}: {data['frames']} frames à {data['fps']} FPS")
