"""Synchronous CPU DMC learner/actor. Targets are completed-match returns only."""
import argparse, json, sys
from pathlib import Path
import numpy as np
import torch
from torch import nn

p=argparse.ArgumentParser()
p.add_argument('--directory',type=Path,required=True)
p.add_argument('--checkpoint',type=Path)
p.add_argument('--seed',type=int,default=240924)
p.add_argument('--hidden',type=int,default=128)
a=p.parse_args()
torch.set_num_threads(1); torch.manual_seed(a.seed)
rng=np.random.default_rng(a.seed)
checkpoint=torch.load(a.checkpoint,map_location='cpu',weights_only=True) if a.checkpoint else None
hidden=checkpoint['hidden'] if checkpoint else a.hidden
model=nn.Sequential(nn.Linear(170,hidden),nn.ReLU(),nn.Linear(hidden,hidden),nn.ReLU(),nn.Linear(hidden,1))
optimizer=torch.optim.RMSprop(model.parameters(),lr=1e-4,alpha=.99,eps=1e-5)
version=0
if checkpoint:
    if checkpoint.get('state_features')!=146 or checkpoint.get('action_features')!=24:
        raise ValueError('checkpoint encoder dimensions differ')
    model.load_state_dict(checkpoint['model']);version=checkpoint['version']
    if 'optimizer' in checkpoint: optimizer.load_state_dict(checkpoint['optimizer'])
    if 'torch_rng' in checkpoint: torch.set_rng_state(checkpoint['torch_rng'])
    if 'numpy_rng' in checkpoint: rng.bit_generator.state=checkpoint['numpy_rng']
a.directory.mkdir(parents=True,exist_ok=True)

def save():
    path=a.directory/f'model-{version:03d}.pt'
    torch.save(dict(model=model.state_dict(),optimizer=optimizer.state_dict(),hidden=hidden,version=version,
                    torch_rng=torch.get_rng_state(),numpy_rng=rng.bit_generator.state,
                    encoder_version='public-belief146-action24-v1',
                    state_features=146,action_features=24,target='completed_match_actor_return'),path)
    return str(path)

for line in sys.stdin:
    try:
        r=json.loads(line);op=r['op']
        if op=='ready':
            with torch.inference_mode(): model(torch.zeros(1,170))
            answer=dict(version=version)
        elif op in ('act','score'):
            xs=[];lengths=[]
            for row in r['rows']:
                state=np.asarray(row['state'],dtype=np.float32);actions=np.asarray(row['actions'],dtype=np.float32)
                if state.shape!=(146,) or actions.ndim!=2 or actions.shape[1]!=24 or not len(actions): raise ValueError('bad act input')
                xs.append(np.concatenate([np.tile(state,(len(actions),1)),actions],axis=1));lengths.append(len(actions))
            with torch.inference_mode(): q=model(torch.from_numpy(np.concatenate(xs))).squeeze(1).numpy()
            if op=='score':
                answer=dict(scores=q.tolist(),version=version)
                print(json.dumps(answer,separators=(',',':')),flush=True)
                continue
            indices=[];values=[];at=0
            for n in lengths:
                v=q[at:at+n]
                # Random tie-breaking avoids an action-order policy at initialization.
                i=int(rng.integers(n)) if rng.random()<r.get('epsilon',0) else int(rng.choice(np.flatnonzero(v==v.max())))
                indices.append(i);values.append(float(v[i]));at+=n
            answer=dict(indices=indices,values=values,version=version)
        elif op=='learn':
            x=np.asarray(r['x'],dtype=np.float32);y=np.asarray(r['y'],dtype=np.float32)
            if x.ndim!=2 or x.shape[1]!=170 or len(x)!=len(y) or not np.isin(y,[-1,0,1]).all(): raise ValueError('bad MC batch')
            if not np.isfinite(x).all(): raise ValueError('nonfinite MC features')
            np.savez_compressed(a.directory/f'batch-{version:03d}.npz',x=x,y=y)
            tx=torch.from_numpy(x);ty=torch.from_numpy(y);losses=[]
            model.train()
            for epoch in range(r.get('epochs',4)):
                ids=rng.permutation(len(x))
                for at in range(0,len(ids),256):
                    ix=ids[at:at+256];pred=model(tx[ix]).squeeze(1)
                    loss=nn.functional.mse_loss(pred,ty[ix])
                    optimizer.zero_grad();loss.backward();nn.utils.clip_grad_norm_(model.parameters(),40);optimizer.step()
                    losses.append(float(loss.detach()))
            version+=1;model.eval()
            answer=dict(version=version,samples=len(x),mse=float(np.mean(losses)),checkpoint=save())
        elif op=='save': answer=dict(version=version,checkpoint=save())
        else: raise ValueError('unknown operation')
        print(json.dumps(answer,separators=(',',':')),flush=True)
    except Exception as e:
        print(json.dumps(dict(error=str(e))),flush=True)
        raise
