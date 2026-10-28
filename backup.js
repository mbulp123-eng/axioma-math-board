export function restoreBoards(data,validate,id,now=Date.now()){
 if(data?.format!=='axioma-backup'||data.version!==1||!Array.isArray(data.boards)||!data.boards.length||data.boards.length>500)throw Error('Нужна резервная копия Аксиомы (1–500 досок)');
 // Validate the entire archive before changing either memory or storage.
 return data.boards.map(board=>({...validate(board),id:id(),format:'axioma',version:1,title:(String(board.title||'Урок').slice(0,95)+' — восстановлено'),updatedAt:now}));
}
