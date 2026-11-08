import io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image

def inspect(path):
    raw = Path(path).read_bytes()
    magic, version, declared = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or len(raw) != declared:
        raise ValueError(f'incomplete or invalid GLB: actual {len(raw)}, declared {declared}')
    pos=12; doc=None; binary=b''
    while pos < len(raw):
        n, typ=struct.unpack_from('<II',raw,pos); pos+=8; chunk=raw[pos:pos+n]; pos+=n
        if typ == 0x4e4f534a: doc=json.loads(chunk.decode('utf-8'))
        if typ == 0x004e4942: binary=chunk
    access=doc.get('accessors',[]); meshes=doc.get('meshes',[]); nodes=doc.get('nodes',[])
    triangles=vertices=0; boxes=[]
    def matrix(node):
        if 'matrix' in node: return np.array(node['matrix']).reshape((4,4),order='F')
        x,y,z,w=node.get('rotation',[0,0,0,1]); sx,sy,sz=node.get('scale',[1,1,1]); t=node.get('translation',[0,0,0])
        m=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]],dtype=float)
        m[:3,:3]=m[:3,:3]@np.diag([sx,sy,sz]); m[:3,3]=t; return m
    def visit(i,parent):
        nonlocal triangles, vertices
        node=nodes[i]; world=parent@matrix(node)
        if 'mesh' in node:
            for p in meshes[node['mesh']]['primitives']:
                a=access[p['attributes']['POSITION']]; vertices+=a['count']; n=access[p['indices']]['count'] if 'indices' in p else a['count']; mode=p.get('mode',4)
                triangles+=n//3 if mode==4 else max(0,n-2) if mode in (5,6) else 0
                if 'min' in a and 'max' in a:
                    lo=a['min']; hi=a['max']; corners=np.array([[x,y,z,1] for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2])]); boxes.extend((world@corners.T).T[:,:3])
        for c in node.get('children',[]): visit(c,world)
    for i in doc.get('scenes',[{}])[doc.get('scene',0)].get('nodes',[]): visit(i,np.eye(4))
    images=[]
    for im in doc.get('images',[]):
        try:
            bv=doc['bufferViews'][im['bufferView']]; off=bv.get('byteOffset',0); picture=Image.open(io.BytesIO(binary[off:off+bv['byteLength']])); images.append({'size':list(picture.size),'format':picture.format})
        except Exception as e: images.append({'unreadable':str(e)})
    return {'file':str(path),'bytes':len(raw),'triangles':triangles,'vertices':vertices,'materials':len(doc.get('materials',[])),'images':images,'bounds_extent':(np.max(boxes,axis=0)-np.min(boxes,axis=0)).tolist() if boxes else None,'note':'Accessor bounds transformed by node hierarchy; scene units nominally meters, scale requires verification. Counts include scene instances; bounds are conservative.'}
for p in sys.argv[1:]:
    try: print(json.dumps(inspect(p),ensure_ascii=False))
    except Exception as e: print(json.dumps({'file':p,'error':str(e)},ensure_ascii=False))
