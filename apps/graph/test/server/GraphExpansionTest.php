<?php
/** Self-contained graph traversal tests. Run: php test/server/GraphExpansionTest.php */
require_once dirname(__DIR__, 3).'/heurist/vendor/autoload.php';

use Heurist\Database\DatabaseInterface;
use Heurist\Runtime\RuntimeContext;
use Heurist\Records\Query\CompiledQuery;
use Heurist\Records\Query\QueryExecutor;
use Heurist\Records\Query\RecordSearchService;
use Heurist\Records\Graph\GraphService;
use Heurist\Records\Graph\GraphRequest;

final class ExpansionDatabase implements DatabaseInterface {
    public function fetchRows(string $sql, array $parameters = array()): array { return str_contains($sql, 'FROM defDetailTypes') ? array(array('freetext','')) : array(); }
    public function fetchAll(string $sql, array $parameters = array()): array { return array(); }
    public function fetchColumn(string $sql, array $parameters = array()): array { return array(); }
    public function fetchValue(string $sql, array $parameters = array(), $default = null) { return str_contains($sql, 'dty_Type') ? 'freetext' : $default; }
    public function getDriver(): string { return 'mysql'; }
}
final class ExpansionExecutor extends QueryExecutor {
    // id => [type, filter value, visible]
    public array $records = array(1=>array(10,'',true),2=>array(48,'',true),3=>array(12,'10443',true),
        4=>array(12,'else',true),5=>array(12,'10443',false),6=>array(4,'',true),7=>array(10,'',true),
        90=>array(1,'',true),91=>array(1,'',false));
    // source, target, field, relationship term, relationship record
    public array $edges = array(array(1,2,240,0,0), array(2,3,134,0,0),array(2,4,134,0,0),array(2,5,134,0,0),
        array(6,3,134,0,0),array(7,3,241,0,0),array(1,7,0,101,90),array(1,6,0,101,91));
    public array $queries = array();
    public function executeIds(CompiledQuery $query): array {
        $this->queries[] = $query;
        if(!str_contains($query->sql, 'rec_NonOwnerVisibility')) throw new Exception('Access filter missing');
        $ids = array_keys($this->records);
        foreach($query->query as $predicate){
            $key = array_key_first($predicate); $value = $predicate[$key];
            $ids = array_values(array_filter($ids, function($id) use ($key,$value){
                if(!$this->records[$id][2]) return false;
                if($key==='ids') return in_array($id, (array)$value);
                if($key==='t') return in_array($this->records[$id][0], (array)$value);
                if($key==='f:133') return $this->records[$id][1]===$value;
                return true;
            }));
        }
        return $ids;
    }
    public function executeScalar(CompiledQuery $query) { return count($this->executeIds($query)); }
    public function executeRows(string $sql, string $types = '', array $values = array()): array {
        if(str_contains($sql, 'FROM defTermsLinks')) return in_array(100,$values) ? array(array(101)) : array();
        if(str_contains($sql, 'FROM defDetailTypes')) return array(array('100','10'));
        if(str_contains($sql, 'FROM Records WHERE')) return array_map(fn($id)=>array($id,$this->records[$id][0],'Record '.$id),$values);
        if(!str_contains($sql, 'FROM recLinks')) return array();
        preg_match('/rl\.(rl_SourceID|rl_TargetID) IN \(([^)]+)\)/', $sql, $match);
        $forward = $match[1]==='rl_SourceID';
        $n = substr_count($match[2], '?'); $parents = array_slice($values,0,$n);
        $rest = array_slice($values,$n);
        $relation = str_contains($sql, 'rl_RelationID IS NOT NULL');
        $rows = array();
        foreach($this->edges as [$source,$target,$field,$term,$rel]){
            $parent = $forward ? $source : $target; $child = $forward ? $target : $source;
            if(!in_array($parent,$parents) || $relation!==($rel>0)) continue;
            if(str_contains($sql,'rl_DetailTypeID=?') && $field!==$rest[0]) continue;
            if(str_contains($sql,'rl_RelationTypeID IN') && !in_array($term,$rest)) continue;
            $rows[] = array($parent,$child,$source,$target,$field,$term,$rel);
        }
        preg_match('/LIMIT (\d+)/',$sql,$limit);
        return array_slice($rows,0,intval($limit[1]));
    }
}
function same($expected,$actual,$message){
    if($expected!==$actual) throw new Exception($message.' expected '.json_encode($expected).' got '.json_encode($actual));
    echo "[PASS] $message\n";
}
$db = new ExpansionDatabase(); $executor = new ExpansionExecutor($db);
$runtime = new RuntimeContext('test','test',0,'');
$search = new RecordSearchService($db,$runtime,null,$executor);
$service = new GraphService($db,$runtime,$search,$executor);
$run = function($ids,$query,$limits=array()) use ($service){
    return $service->build(new GraphRequest(array(array('ids'=>$ids)),array('limit'=>10000,
        'rule'=>array('query'=>$query), 'limits'=>$limits)))->toArray();
};
$first = $run(array(1,6),array('t'=>48,'lf:240'=>array(array('t'=>10))));
same(array(2),$first['expansion']['targetIds'],'forward traversal matches source type');
same(array(1,6,2),array_column($first['graph']['records'],'rec_ID'),'fragment retains seeds and child');
$second = $run(array(2),array('t'=>12,'lf:134'=>array(array('t'=>48)),'f:133'=>'10443'));
same(array(3),$second['expansion']['targetIds'],'target filters and private records excluded');
$reverse = $run(array(3),array('t'=>4,'lt:134'=>array(array('t'=>12))));
same(array(6),$reverse['expansion']['targetIds'],'reverse traversal');
same(6,$reverse['graph']['edges'][0]['source'],'physical edge direction preserved');
$wrongParent = $run(array(2),array('t'=>12,'lf:134'=>array(array('t'=>10))));
same(array(),$wrongParent['expansion']['targetIds'],'wrong source type cannot expand');
$relation = $run(array(1),array('rf'=>array(array('t'=>10),array('r'=>100))));
same(array(7),$relation['expansion']['targetIds'],'relationship descendants and relationship-record access');
same(101,$relation['graph']['edges'][0]['relationship'],'graph relationship is a term, not a record ID');
$limited = $run(array(2),array('t'=>12,'lf:134'=>array(array('t'=>48))),array('maxNodes'=>2));
same(2,count($limited['graph']['records']),'node budget includes seeds');
same(true,$limited['graph']['limits']['truncated'],'partial expansion is reported');
$empty = $run(array(999),array('lf:240'=>array(array('t'=>10))));
same(array(),$empty['graph']['records'],'missing seeds do not broaden the query');
echo "Graph expansion tests passed.\n";
