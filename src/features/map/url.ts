export function tripFromUrl(url: string, knownIds: readonly string[]) {
 const value=new URL(url,'http://localhost').searchParams.get('trip');
 return {id:value && knownIds.includes(value)?value:null,unknown:value!==null && !knownIds.includes(value)};
}
export function urlForTrip(url:string,id:string|null) {
 const next=new URL(url,'http://localhost');
 if(id) next.searchParams.set('trip',id); else next.searchParams.delete('trip');
 return `${next.pathname}${next.search}${next.hash}`;
}
